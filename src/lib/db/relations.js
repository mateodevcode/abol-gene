import { logChange } from '@/lib/db/change-log';
import { shortName } from '@/lib/db/persons';

const LINK_KINDS = ['biological', 'adoptive', 'foster', 'step'];
const CERTAINTIES = ['confirmed', 'unconfirmed'];
const UNION_KINDS = ['marriage', 'free_union', 'partnership'];
const END_REASONS = ['divorce', 'widowed', 'separation'];
const PRECISIONS = ['day', 'month', 'year', 'decade', 'approximate'];

/** IDs de todos los antepasados de una persona (vínculos no borrados). */
export async function ancestorIds(db, personId) {
  const { rows } = await db.query(
    `WITH RECURSIVE up AS (
       SELECT parent_id FROM parent_links WHERE child_id=$1 AND deleted_at IS NULL
       UNION
       SELECT pl.parent_id FROM parent_links pl JOIN up ON up.parent_id = pl.child_id
        WHERE pl.deleted_at IS NULL
     ) SELECT parent_id AS id FROM up`, [personId]);
  return rows.map((r) => r.id);
}

async function requirePerson(db, id, rol) {
  const { rows: [p] } = await db.query('SELECT * FROM persons WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!p) throw new Error(`${rol} no encontrado en el árbol.`);
  return p;
}

function yearOf(dateStr) {
  if (!dateStr) return null;
  const d = new Date(typeof dateStr === 'string' ? dateStr.slice(0, 10) : dateStr);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/**
 * Coherencia cronológica padre/hijo: nadie nace antes que su padre o madre
 * (biológico o adoptivo). En crianza o hijastros no se exige: el vínculo es
 * social y el "padre" puede ser menor.
 */
export async function assertParentDates(db, parentId, childId, kind = 'biological') {
  if (!['biological', 'adoptive'].includes(kind)) return;
  const [parent, child] = await Promise.all([
    requirePerson(db, parentId, 'El padre o madre'),
    requirePerson(db, childId, 'El hijo o hija'),
  ]);
  const pb = yearOf(parent.birth_date);
  const cb = yearOf(child.birth_date);
  if (pb != null && cb != null && cb < pb) {
    throw new Error(
      `No se puede: ${shortName(child)} nació en ${cb}, antes que ${shortName(parent)} (${pb}). Revisa las fechas.`);
  }
}

/**
 * Coherencia de la unión: empieza después de que nazcan ambos y
 * termina después de empezar (cuando hay fechas).
 */
export async function assertUnionDates(db, aId, bId, { start_date, end_date }) {
  const [{ rows: [a] }, { rows: [b] }] = await Promise.all([
    db.query('SELECT * FROM persons WHERE id=$1 AND deleted_at IS NULL', [aId]),
    db.query('SELECT * FROM persons WHERE id=$1 AND deleted_at IS NULL', [bId]),
  ]);
  if (start_date && a?.birth_date && start_date < String(a.birth_date).slice(0, 10)) {
    throw new Error(`La unión empieza en ${start_date}, antes de que naciera ${shortName(a)}. Revisa las fechas.`);
  }
  if (start_date && b?.birth_date && start_date < String(b.birth_date).slice(0, 10)) {
    throw new Error(`La unión empieza en ${start_date}, antes de que naciera ${shortName(b)}. Revisa las fechas.`);
  }
  if (start_date && end_date && end_date < start_date) {
    throw new Error('La unión no puede terminar antes de empezar. Revisa las fechas.');
  }
}

/**
 * Rechaza la relación si crea un ciclo, con mensaje claro en español.
 * Agregar P como padre de C es ciclo si C ya es antepasado de P.
 */
export async function assertNoCycle(db, parentId, childId) {
  if (parentId === childId) {
    throw new Error('Una persona no puede ser padre o madre de sí misma.');
  }
  const ancestors = await ancestorIds(db, parentId);
  if (ancestors.includes(childId)) {
    const [child, parent] = await Promise.all([
      requirePerson(db, childId, 'La persona'),
      requirePerson(db, parentId, 'El padre o madre'),
    ]);
    throw new Error(
      `No se puede: ${shortName(child)} ya es antepasado de ${shortName(parent)}. ` +
      `Agregarlo como su hijo crearía un ciclo en el árbol.`);
  }
}

/** Agrega un vínculo padre/hijo con protección contra ciclos. */
export async function addParentLink(db, userId, { parent_id, child_id, kind = 'biological', certainty = 'confirmed' }) {
  if (!LINK_KINDS.includes(kind)) throw new Error(`Tipo de vínculo no válido: ${kind}.`);
  if (!CERTAINTIES.includes(certainty)) throw new Error(`Certeza no válida: ${certainty}.`);
  await requirePerson(db, parent_id, 'El padre o madre');
  await requirePerson(db, child_id, 'El hijo o hija');
  await assertNoCycle(db, parent_id, child_id);
  await assertParentDates(db, parent_id, child_id, kind);
  const dup = await db.query(
    'SELECT id FROM parent_links WHERE parent_id=$1 AND child_id=$2 AND deleted_at IS NULL',
    [parent_id, child_id]);
  if (dup.rows[0]) throw new Error('Ese vínculo padre/hijo ya existe.');
  const { rows: [link] } = await db.query(
    'INSERT INTO parent_links (parent_id, child_id, kind, certainty) VALUES ($1,$2,$3,$4) RETURNING *',
    [parent_id, child_id, kind, certainty]);
  await logChange(db, { entity_type: 'parent_link', entity_id: link.id, action: 'create', after: link, user_id: userId });
  return link;
}

/** Edita tipo/certeza de un vínculo. */
export async function updateParentLink(db, userId, parentId, childId, { kind, certainty }) {
  const { rows: [before] } = await db.query(
    'SELECT * FROM parent_links WHERE parent_id=$1 AND child_id=$2 AND deleted_at IS NULL', [parentId, childId]);
  if (!before) throw new Error('Vínculo no encontrado.');
  if (kind !== undefined && !LINK_KINDS.includes(kind)) throw new Error(`Tipo de vínculo no válido: ${kind}.`);
  if (certainty !== undefined && !CERTAINTIES.includes(certainty)) throw new Error(`Certeza no válida: ${certainty}.`);
  await assertParentDates(db, parentId, childId, kind ?? before.kind);
  const { rows: [after] } = await db.query(
    `UPDATE parent_links SET kind=COALESCE($3,kind), certainty=COALESCE($4,certainty)
      WHERE parent_id=$1 AND child_id=$2 AND deleted_at IS NULL RETURNING *`,
    [parentId, childId, kind ?? null, certainty ?? null]);
  await logChange(db, { entity_type: 'parent_link', entity_id: after.id, action: 'update', before, after, user_id: userId });
  return after;
}

/** Quita un vínculo (borrado lógico). */
export async function removeParentLink(db, userId, parentId, childId) {
  const { rows: [before] } = await db.query(
    'SELECT * FROM parent_links WHERE parent_id=$1 AND child_id=$2 AND deleted_at IS NULL', [parentId, childId]);
  if (!before) throw new Error('Vínculo no encontrado.');
  await db.query('UPDATE parent_links SET deleted_at=now() WHERE id=$1', [before.id]);
  await logChange(db, { entity_type: 'parent_link', entity_id: before.id, action: 'delete', before, user_id: userId });
  return true;
}

function checkUnionInput(data, { partial = false } = {}) {
  if (!partial || data.kind !== undefined) {
    if (!UNION_KINDS.includes(data.kind)) throw new Error(`Tipo de unión no válido: ${data.kind}.`);
  }
  for (const f of ['start_date_precision', 'end_date_precision']) {
    if (data[f] != null && !PRECISIONS.includes(data[f])) throw new Error(`Precisión no válida: ${data[f]}.`);
  }
  if (data.end_reason != null && !END_REASONS.includes(data.end_reason)) {
    throw new Error(`Motivo de fin no válido: ${data.end_reason}.`);
  }
}

/** Crea una unión (pareja). */
export async function createUnion(db, userId, data) {
  const { person_a_id, person_b_id } = data;
  if (!person_a_id || !person_b_id) throw new Error('La unión necesita dos personas.');
  if (person_a_id === person_b_id) throw new Error('Una persona no puede formar pareja consigo misma.');
  checkUnionInput(data);
  await requirePerson(db, person_a_id, 'La primera persona');
  await requirePerson(db, person_b_id, 'La segunda persona');
  await assertUnionDates(db, person_a_id, person_b_id, data);
  const { rows: [union] } = await db.query(
    `INSERT INTO unions (person_a_id, person_b_id, kind, start_date, start_date_precision,
       end_date, end_date_precision, end_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [person_a_id, person_b_id, data.kind ?? 'marriage', data.start_date ?? null,
      data.start_date_precision ?? null, data.end_date ?? null, data.end_date_precision ?? null,
      data.end_reason ?? null]);
  await logChange(db, { entity_type: 'union', entity_id: union.id, action: 'create', after: union, user_id: userId });
  return union;
}

/** Edita una unión. */
export async function updateUnion(db, userId, id, data) {
  const { rows: [before] } = await db.query('SELECT * FROM unions WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Unión no encontrada.');
  checkUnionInput(data, { partial: true });
  const fields = ['kind', 'start_date', 'start_date_precision', 'end_date', 'end_date_precision', 'end_reason'];
  const cols = fields.filter((f) => data[f] !== undefined);
  if (cols.length === 0) return before;
  await assertUnionDates(db, before.person_a_id, before.person_b_id, {
    start_date: data.start_date ?? before.start_date,
    end_date: data.end_date ?? before.end_date,
  });
  const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
  const { rows: [after] } = await db.query(
    `UPDATE unions SET ${set} WHERE id=$${cols.length + 1} AND deleted_at IS NULL RETURNING *`,
    [...cols.map((c) => data[c] === '' ? null : data[c]), id]);
  await logChange(db, { entity_type: 'union', entity_id: id, action: 'update', before, after, user_id: userId });
  return after;
}

/** Termina/borra una unión (borrado lógico). */
export async function deleteUnion(db, userId, id) {
  const { rows: [before] } = await db.query('SELECT * FROM unions WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Unión no encontrada.');
  await db.query('UPDATE unions SET deleted_at=now() WHERE id=$1', [id]);
  await logChange(db, { entity_type: 'union', entity_id: id, action: 'delete', before, user_id: userId });
  return true;
}
