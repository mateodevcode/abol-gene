import { logChange } from '@/lib/db/change-log';

const PRECISIONS = ['day', 'month', 'year', 'decade', 'approximate'];

const PERSON_COLUMNS = [
  'given_names', 'paternal_surname', 'maternal_surname', 'nickname', 'birth_surname',
  'gender', 'birth_date', 'birth_date_precision', 'birth_place',
  'death_date', 'death_date_precision', 'death_place',
  'is_living', 'branch_id', 'cover_photo_id', 'bio_short',
];

/** Nombre corto para mensajes: "Carmen García". */
export function shortName(p) {
  if (!p) return 'esa persona';
  return [p.given_names, p.paternal_surname].filter(Boolean).join(' ') || 'esa persona';
}

function checkPrecision(value, campo) {
  if (value != null && !PRECISIONS.includes(value)) {
    throw new Error(`Precisión no válida en ${campo}: usa ${PRECISIONS.join(', ')}.`);
  }
}

function checkDate(value, campo) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha no válida en ${campo}.`);
  return value;
}

/**
 * Valida datos de persona. `partial=true` para PATCH (solo valida lo presente).
 */
export async function validatePerson(db, data, { partial = false } = {}) {
  if (!partial || data.given_names !== undefined) {
    if (!String(data.given_names ?? '').trim()) throw new Error('El nombre es obligatorio.');
  }
  checkPrecision(data.birth_date_precision, 'nacimiento');
  checkPrecision(data.death_date_precision, 'fallecimiento');
  const birth = checkDate(data.birth_date, 'nacimiento');
  const death = checkDate(data.death_date, 'fallecimiento');
  if (birth && new Date(birth) > new Date()) {
    throw new Error('La fecha de nacimiento no puede estar en el futuro.');
  }
  if (birth && death && new Date(death) < new Date(birth)) {
    throw new Error('La fecha de fallecimiento no puede ser anterior al nacimiento.');
  }
  if (data.branch_id) {
    const b = await db.query('SELECT id FROM branches WHERE id=$1 AND deleted_at IS NULL', [data.branch_id]);
    if (!b.rows[0]) throw new Error('La rama no existe.');
  }
  if (data.cover_photo_id) {
    const ph = await db.query('SELECT id FROM photos WHERE id=$1 AND deleted_at IS NULL', [data.cover_photo_id]);
    if (!ph.rows[0]) throw new Error('La foto de portada no existe.');
  }
}

function pickColumns(data) {
  const cols = [];
  const vals = [];
  for (const c of PERSON_COLUMNS) {
    if (data[c] !== undefined) {
      cols.push(c);
      vals.push(data[c] === '' ? null : data[c]);
    }
  }
  return { cols, vals };
}

/**
 * Si cambia la fecha de nacimiento, debe seguir siendo coherente con sus
 * padres (biológicos/adoptivos), hijos y uniones ya registrados.
 */
export async function assertBirthChange(db, id, newBirth) {
  if (!newBirth) return;
  const nb = String(newBirth).slice(0, 10);
  const me = await getPerson(db, id);
  const name = shortName(me);
  const { rows: parents } = await db.query(
    `SELECT p.given_names, p.paternal_surname, p.birth_date, pl.kind
       FROM parent_links pl JOIN persons p ON p.id = pl.parent_id
      WHERE pl.child_id=$1 AND pl.deleted_at IS NULL AND p.deleted_at IS NULL`, [id]);
  for (const p of parents) {
    if (!['biological', 'adoptive'].includes(p.kind) || !p.birth_date) continue;
    if (nb < String(p.birth_date).slice(0, 10)) {
      throw new Error(
        `No se puede: ${name} quedaría nacido antes que ${shortName(p)} (${String(p.birth_date).slice(0, 4)}). Revisa las fechas.`);
    }
  }
  const { rows: children } = await db.query(
    `SELECT p.given_names, p.paternal_surname, p.birth_date, pl.kind
       FROM parent_links pl JOIN persons p ON p.id = pl.child_id
      WHERE pl.parent_id=$1 AND pl.deleted_at IS NULL AND p.deleted_at IS NULL`, [id]);
  for (const c of children) {
    if (!['biological', 'adoptive'].includes(c.kind) || !c.birth_date) continue;
    if (String(c.birth_date).slice(0, 10) < nb) {
      throw new Error(
        `No se puede: ${shortName(c)} quedaría nacido antes que ${name}. Revisa las fechas.`);
    }
  }
  const { rows: unions } = await db.query(
    'SELECT start_date FROM unions WHERE (person_a_id=$1 OR person_b_id=$1) AND deleted_at IS NULL AND start_date IS NOT NULL', [id]);
  for (const u of unions) {
    if (String(u.start_date).slice(0, 10) < nb) {
      throw new Error(`No se puede: hay una unión que empieza antes del nuevo nacimiento de ${name}. Revisa las fechas.`);
    }
  }
}

export async function getPerson(db, id) {
  const { rows: [row] } = await db.query(
    `SELECT p.*, b.name AS branch_name, b.color AS branch_color
       FROM persons p LEFT JOIN branches b ON b.id = p.branch_id
      WHERE p.id=$1 AND p.deleted_at IS NULL`, [id]);
  return row ?? null;
}

/** Crea una persona y registra el cambio. Devuelve { person, warnings }. */
export async function createPerson(db, userId, data) {
  await validatePerson(db, data);
  const { cols, vals } = pickColumns({ is_living: true, ...data });
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  const { rows: [person] } = await db.query(
    `INSERT INTO persons (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
  await logChange(db, { entity_type: 'person', entity_id: person.id, action: 'create', after: person, user_id: userId });
  return person;
}

/** Edita una persona y registra antes/después. */
export async function updatePerson(db, userId, id, data) {
  const before = await getPerson(db, id);
  if (!before) throw new Error('Persona no encontrada.');
  await validatePerson(db, data, { partial: true });
  if (data.birth_date !== undefined && data.birth_date !== before.birth_date) {
    await assertBirthChange(db, id, data.birth_date);
  }
  const { cols, vals } = pickColumns(data);
  if (cols.length === 0) return before;
  const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
  const { rows: [after] } = await db.query(
    `UPDATE persons SET ${set} WHERE id=$${cols.length + 1} AND deleted_at IS NULL RETURNING *`,
    [...vals, id]);
  await logChange(db, { entity_type: 'person', entity_id: id, action: 'update', before, after, user_id: userId });
  return after;
}

/** Borrado lógico de una persona y registro. */
export async function deletePerson(db, userId, id) {
  const before = await getPerson(db, id);
  if (!before) throw new Error('Persona no encontrada.');
  await db.query('UPDATE persons SET deleted_at=now() WHERE id=$1', [id]);
  await logChange(db, { entity_type: 'person', entity_id: id, action: 'delete', before, user_id: userId });
  return true;
}

/** Búsqueda por nombre con tolerancia a faltas y nombres cortos. */
export async function searchPersons(db, q, { limit = 10 } = {}) {
  const clean = String(q ?? '').trim();
  if (clean.length < 2) return [];
  const { rows } = await db.query(
    `SELECT p.id, p.given_names, p.paternal_surname, p.maternal_surname, p.nickname,
            p.birth_date, p.birth_date_precision, p.death_date, p.is_living,
            b.name AS branch_name, b.color AS branch_color,
            word_similarity(lower(unaccent($1)), p.full_name_normalized) AS score
       FROM persons p LEFT JOIN branches b ON b.id = p.branch_id
      WHERE p.deleted_at IS NULL AND (
        p.full_name_normalized % lower(unaccent($1))
        OR word_similarity(lower(unaccent($1)), p.full_name_normalized) > 0.3
        OR lower(unaccent(p.full_name_normalized)) LIKE '%' || lower(unaccent($1)) || '%'
      )
      ORDER BY score DESC, p.birth_date LIMIT $2`,
    [clean, limit]);
  return rows;
}
