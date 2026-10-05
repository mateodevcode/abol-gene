import { logChange } from '@/lib/db/change-log';

const CERTAINTIES = ['confirmed', 'unconfirmed'];
const PRECISIONS = ['day', 'month', 'year', 'decade', 'approximate'];
const FACT_TYPES = ['occupation', 'residence', 'origin', 'anecdote', 'other'];

async function requirePerson(db, id) {
  const { rows: [p] } = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!p) throw new Error('Persona no encontrada.');
}

/* ---------- historias ---------- */

export async function createStory(db, userId, personId, data) {
  await requirePerson(db, personId);
  if (!String(data.body ?? '').trim()) throw new Error('La historia necesita texto.');
  if (data.certainty !== undefined && !CERTAINTIES.includes(data.certainty)) {
    throw new Error('Certeza no válida.');
  }
  if (data.story_date_precision != null && !PRECISIONS.includes(data.story_date_precision)) {
    throw new Error('Precisión no válida.');
  }
  const { rows: [story] } = await db.query(
    `INSERT INTO stories (person_id, author_user_id, title, body, story_date, story_date_precision, certainty)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [personId, userId, data.title?.trim() || null, data.body.trim(),
      data.story_date || null, data.story_date_precision || null, data.certainty ?? 'confirmed']);
  const mentions = [...new Set(data.mentions ?? [])].filter((m) => m && m !== personId);
  const saved = [];
  for (const m of mentions) {
    const t = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [m]);
    if (t.rows[0]) {
      await db.query('INSERT INTO story_mentions (story_id, person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [story.id, m]);
      saved.push(m);
    }
  }
  await logChange(db, { entity_type: 'story', entity_id: story.id, action: 'create', after: story, user_id: userId });
  return { ...story, mentions: saved };
}

export async function updateStory(db, userId, id, data) {
  const { rows: [before] } = await db.query('SELECT * FROM stories WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Historia no encontrada.');
  if (data.certainty !== undefined && !CERTAINTIES.includes(data.certainty)) throw new Error('Certeza no válida.');
  const fields = ['title', 'body', 'story_date', 'story_date_precision', 'certainty'];
  const cols = fields.filter((f) => data[f] !== undefined);
  let after = before;
  if (cols.length) {
    const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
    const vals = cols.map((c) => (data[c] === '' ? null : data[c]));
    ({ rows: [after] } = await db.query(
      `UPDATE stories SET ${set} WHERE id=$${cols.length + 1} AND deleted_at IS NULL RETURNING *`, [...vals, id]));
  }
  if (data.mentions !== undefined) {
    await db.query('DELETE FROM story_mentions WHERE story_id=$1', [id]);
    for (const m of [...new Set(data.mentions)].filter((m) => m && m !== before.person_id)) {
      const t = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [m]);
      if (t.rows[0]) {
        await db.query('INSERT INTO story_mentions (story_id, person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, m]);
      }
    }
    const { rows: [fresh] } = await db.query('SELECT * FROM stories WHERE id=$1', [id]);
    after = fresh;
  }
  await logChange(db, { entity_type: 'story', entity_id: id, action: 'update', before, after, user_id: userId });
  return after;
}

export async function deleteStory(db, userId, id) {
  const { rows: [before] } = await db.query('SELECT * FROM stories WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Historia no encontrada.');
  await db.query('UPDATE stories SET deleted_at=now() WHERE id=$1', [id]);
  await logChange(db, { entity_type: 'story', entity_id: id, action: 'delete', before, user_id: userId });
  return true;
}

/* ---------- hechos ---------- */

export async function createFact(db, userId, personId, data) {
  await requirePerson(db, personId);
  if (!FACT_TYPES.includes(data.type)) throw new Error('Tipo de dato no válido.');
  if (!String(data.value ?? '').trim()) throw new Error('El dato necesita texto.');
  if (data.certainty !== undefined && !CERTAINTIES.includes(data.certainty)) throw new Error('Certeza no válida.');
  const { rows: [fact] } = await db.query(
    'INSERT INTO facts (person_id, type, value, certainty, source) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [personId, data.type, data.value.trim(), data.certainty ?? 'confirmed', data.source?.trim() || null]);
  await logChange(db, { entity_type: 'fact', entity_id: fact.id, action: 'create', after: fact, user_id: userId });
  return fact;
}

export async function updateFact(db, userId, id, data) {
  const { rows: [before] } = await db.query('SELECT * FROM facts WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Dato no encontrado.');
  if (data.type !== undefined && !FACT_TYPES.includes(data.type)) throw new Error('Tipo de dato no válido.');
  if (data.certainty !== undefined && !CERTAINTIES.includes(data.certainty)) throw new Error('Certeza no válida.');
  const fields = ['type', 'value', 'certainty', 'source'];
  const cols = fields.filter((f) => data[f] !== undefined);
  if (!cols.length) return before;
  const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
  const vals = cols.map((c) => (data[c] === '' ? null : data[c]));
  const { rows: [after] } = await db.query(
    `UPDATE facts SET ${set} WHERE id=$${cols.length + 1} AND deleted_at IS NULL RETURNING *`, [...vals, id]);
  await logChange(db, { entity_type: 'fact', entity_id: id, action: 'update', before, after, user_id: userId });
  return after;
}

export async function deleteFact(db, userId, id) {
  const { rows: [before] } = await db.query('SELECT * FROM facts WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Dato no encontrado.');
  await db.query('UPDATE facts SET deleted_at=now() WHERE id=$1', [id]);
  await logChange(db, { entity_type: 'fact', entity_id: id, action: 'delete', before, user_id: userId });
  return true;
}
