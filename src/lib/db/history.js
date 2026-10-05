/**
 * Historial (change_log): listado con actor y DESHACER.
 * Regla: member deshace sus cambios propios; admin cualquiera.
 * Deshacer crea una entrada nueva action='restore' (la historia no se borra).
 */

const ENTITY_TABLE = {
  person: 'persons',
  branch: 'branches',
  parent_link: 'parent_links',
  union: 'unions',
  story: 'stories',
  fact: 'facts',
  photo: 'photos',
};

// Columnas restaurables en un update (nunca id/created_at/created_by).
const RESTORABLE = {
  persons: ['given_names', 'paternal_surname', 'maternal_surname', 'nickname', 'birth_surname', 'gender', 'birth_date', 'birth_date_precision', 'birth_place', 'death_date', 'death_date_precision', 'death_place', 'is_living', 'branch_id', 'cover_photo_id', 'bio_short', 'deleted_at'],
  branches: ['name', 'color', 'founder_person_id', 'deleted_at'],
  parent_links: ['parent_id', 'child_id', 'kind', 'certainty', 'deleted_at'],
  unions: ['person_a_id', 'person_b_id', 'kind', 'start_date', 'start_date_precision', 'end_date', 'end_date_precision', 'end_reason', 'deleted_at'],
  stories: ['person_id', 'title', 'body', 'story_date', 'story_date_precision', 'certainty', 'deleted_at'],
  facts: ['person_id', 'type', 'value', 'certainty', 'source', 'deleted_at'],
  photos: ['caption', 'photo_date', 'deleted_at'],
};

const ACTION_ES = { create: 'creó', update: 'editó', delete: 'borró', merge: 'fusionó', restore: 'restauró' };
const ENTITY_ES = {
  person: 'persona', branch: 'rama', parent_link: 'vínculo', union: 'unión', story: 'historia',
  fact: 'dato', photo: 'foto', photo_tag: 'etiqueta', invite: 'invitación', merge_candidates: 'duplicado',
};

/** Lista el historial con actor, más recientes primero. */
export async function listChanges(db, { limit = 100, entity_type = null, user_id = null } = {}) {
  const conds = [];
  const vals = [];
  if (entity_type) {
    conds.push(`c.entity_type = $${vals.length + 1}`);
    vals.push(entity_type);
  }
  if (user_id) {
    conds.push(`c.user_id = $${vals.length + 1}`);
    vals.push(user_id);
  }
  const { rows } = await db.query(
    `SELECT c.*, u.name AS actor_name, u.email AS actor_email
       FROM change_log c LEFT JOIN users u ON u.id = c.user_id
      ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
      ORDER BY c.created_at DESC LIMIT ${Math.min(Number(limit) || 100, 200)}`, vals);
  return rows;
}

/** ¿Puede `user` deshacer esta entrada? */
export function canUndo(entry, user) {
  if (!entry) return false;
  if (user.role === 'admin') return true;
  return entry.user_id === user.id;
}

function undoableError(entry) {
  if (entry.action === 'merge') return null; // la fusión sí se revierte (lógica propia)
  if (entry.action === 'restore') throw new Error('No se puede deshacer una restauración.');
  if (!ENTITY_TABLE[entry.entity_type]) {
    throw new Error('Este cambio no se puede deshacer automáticamente.');
  }
  return null;
}

/**
 * Deshace una entrada (en transacción) y registra action='restore'.
 * @returns {{ entity_type: string, entity_id: string }}
 */
export async function undoChange(db, user, changeId) {
  const { rows: [entry] } = await db.query('SELECT * FROM change_log WHERE id=$1', [changeId]);
  if (!entry) throw new Error('Cambio no encontrado.');
  if (!canUndo(entry, user)) throw new Error('Solo puedes deshacer tus propios cambios.');
  undoableError(entry);

  if (entry.action === 'merge') {
    await undoMerge(db, user, entry);
    return { entity_type: entry.entity_type, entity_id: entry.entity_id };
  }

  const table = ENTITY_TABLE[entry.entity_type];
  const before = entry.before;
  const after = entry.after;
  if (entry.action === 'create') {
    // Lo creado se oculta (borrado lógico).
    const target = after?.id ?? entry.entity_id;
    await db.query(`UPDATE ${table} SET deleted_at=now() WHERE id=$1`, [target]);
  } else if (entry.action === 'delete') {
    await db.query(`UPDATE ${table} SET deleted_at=NULL WHERE id=$1`, [entry.entity_id]);
  } else if (entry.action === 'update') {
    if (!before) throw new Error('Sin datos previos para restaurar.');
    const cols = RESTORABLE[entry.entity_type].filter((c) => before[c] !== undefined);
    if (!cols.length) throw new Error('Nada que restaurar.');
    const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
    const vals = cols.map((c) => before[c]);
    await db.query(`UPDATE ${table} SET ${set} WHERE id=$${cols.length + 1}`, [...vals, entry.entity_id]);
  }
  if (entry.entity_type === 'photo_tag') {
    if (entry.action === 'create') {
      await db.query('DELETE FROM photo_tags WHERE photo_id=$1 AND person_id=$2',
        [after.photo_id, after.person_id]);
    } else if (entry.action === 'delete') {
      await db.query('INSERT INTO photo_tags (photo_id, person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [before.photo_id, before.person_id]);
    }
  }
  await db.query(
    `INSERT INTO change_log (entity_type, entity_id, action, before, after, user_id)
     VALUES ($1,$2,'restore',$3,$4,$5)`,
    [entry.entity_type, entry.entity_id, entry.after ? JSON.stringify(entry.after) : null,
      entry.before ? JSON.stringify(entry.before) : null, user.id]);
  return { entity_type: entry.entity_type, entity_id: entry.entity_id };
}

/* ---------- fusión y su reversa ---------- */

async function tableIds(db, table, column, id) {
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE ${column}=$1`, [id]);
  return rows.map((r) => r.id);
}

/**
 * Fusiona `dropId` en `keepId`: mueve referencias, oculta al duplicado y
 * guarda fotos completas de todo lo tocado para poder deshacer.
 */
export async function mergePersons(db, userId, keepId, dropId) {
  if (keepId === dropId) throw new Error('Son la misma persona.');
  for (const id of [keepId, dropId]) {
    const { rows: [p] } = await db.query('SELECT * FROM persons WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!p) throw new Error('Persona no encontrada.');
  }
  const moved = { links_as_parent: [], links_as_child: [], links_deleted: [], unions: [], unions_deleted: [], stories: [], facts: [], story_mentions: [], photo_tags: [], users: [], invites: [], branches: [] };

  const snap = async (table, ids) => {
    if (!ids.length) return [];
    const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = ANY($1)`, [ids]);
    return rows;
  };

  // Vínculos como padre: borrar los que duplicarían a keep, mover el resto.
  const { rows: dupParent } = await db.query(
    `SELECT * FROM parent_links WHERE parent_id=$1 AND child_id IN
      (SELECT child_id FROM parent_links WHERE parent_id=$2 AND deleted_at IS NULL)`, [dropId, keepId]);
  moved.links_deleted.push(...dupParent);
  await db.query('DELETE FROM parent_links WHERE id = ANY($1)', [dupParent.map((r) => r.id)]);
  const asParent = await tableIds(db, 'parent_links', 'parent_id', dropId);
  moved.links_as_parent.push(...await snap('parent_links', asParent));
  await db.query('UPDATE parent_links SET parent_id=$1 WHERE parent_id=$2', [keepId, dropId]);
  // Vínculos como hijo: igual.
  const { rows: dupChild } = await db.query(
    `SELECT * FROM parent_links WHERE child_id=$1 AND parent_id IN
      (SELECT parent_id FROM parent_links WHERE child_id=$2 AND deleted_at IS NULL)`, [dropId, keepId]);
  moved.links_deleted.push(...dupChild);
  await db.query('DELETE FROM parent_links WHERE id = ANY($1)', [dupChild.map((r) => r.id)]);
  const asChild = await tableIds(db, 'parent_links', 'child_id', dropId);
  moved.links_as_child.push(...await snap('parent_links', asChild));
  await db.query('UPDATE parent_links SET child_id=$1 WHERE child_id=$2', [keepId, dropId]);

  // Uniones: las que unirían a keep consigo mismo se borran; duplicadas también.
  const { rows: unions } = await db.query(
    'SELECT * FROM unions WHERE (person_a_id=$1 OR person_b_id=$1) AND deleted_at IS NULL', [dropId]);
  for (const u of unions) {
    const other = u.person_a_id === dropId ? u.person_b_id : u.person_a_id;
    if (other === keepId) {
      moved.unions_deleted.push(u);
      await db.query('UPDATE unions SET deleted_at=now() WHERE id=$1', [u.id]);
      continue;
    }
    const dup = await db.query(
      `SELECT id FROM unions WHERE deleted_at IS NULL AND
        ((person_a_id=$1 AND person_b_id=$2) OR (person_a_id=$2 AND person_b_id=$1))`,
      [keepId, other]);
    if (dup.rows[0]) {
      moved.unions_deleted.push(u);
      await db.query('UPDATE unions SET deleted_at=now() WHERE id=$1', [u.id]);
      continue;
    }
    moved.unions.push(u);
    await db.query('UPDATE unions SET person_a_id=CASE WHEN person_a_id=$1 THEN $2 ELSE person_a_id END, person_b_id=CASE WHEN person_b_id=$1 THEN $2 ELSE person_b_id END WHERE id=$3',
      [dropId, keepId, u.id]);
  }

  for (const [table, column, key] of [
    ['stories', 'person_id', 'stories'], ['facts', 'person_id', 'facts'],
    ['users', 'person_id', 'users'], ['invites', 'target_person_id', 'invites'],
    ['branches', 'founder_person_id', 'branches'],
  ]) {
    const ids = await tableIds(db, table, column, dropId);
    moved[key].push(...await snap(table, ids));
    if (ids.length) await db.query(`UPDATE ${table} SET ${column}=$1 WHERE ${column}=$2`, [keepId, dropId]);
  }
  // Menciones y etiquetas (compuestas): mover con ON CONFLICT.
  for (const m of (await db.query('SELECT story_id, person_id FROM story_mentions WHERE person_id=$1', [dropId])).rows) {
    moved.story_mentions.push(m);
  }
  await db.query('DELETE FROM story_mentions WHERE person_id=$1 AND story_id IN (SELECT story_id FROM story_mentions WHERE person_id=$2)', [dropId, keepId]);
  await db.query('UPDATE story_mentions SET person_id=$1 WHERE person_id=$2', [keepId, dropId]);
  for (const m of (await db.query('SELECT photo_id, person_id FROM photo_tags WHERE person_id=$1', [dropId])).rows) {
    if (!moved.photo_tags.some((x) => x.photo_id === m.photo_id && x.person_id === keepId)) moved.photo_tags.push(m);
  }
  await db.query('DELETE FROM photo_tags WHERE person_id=$1 AND photo_id IN (SELECT photo_id FROM photo_tags WHERE person_id=$2)', [dropId, keepId]);
  await db.query('UPDATE photo_tags SET person_id=$1 WHERE person_id=$2', [keepId, dropId]);
  const { rows: [drop] } = await db.query('SELECT * FROM persons WHERE id=$1', [dropId]);
  await db.query('UPDATE persons SET deleted_at=now() WHERE id=$1', [dropId]);
  await db.query(`UPDATE merge_candidates SET status='merged' WHERE status='pending' AND
    ((person_a_id=$1 AND person_b_id=$2) OR (person_a_id=$2 AND person_b_id=$1))`, [keepId, dropId]);

  const { rows: [log] } = await db.query(
    `INSERT INTO change_log (entity_type, entity_id, action, before, after, user_id)
     VALUES ('person',$1,'merge',$2,$3,$4) RETURNING *`,
    [keepId, JSON.stringify({ dropped: drop }), JSON.stringify({ kept: keepId, dropped: dropId, moved }), userId]);
  return { kept: keepId, dropped: dropId, logId: log.id };
}

async function undoMerge(db, user, entry) {
  const after = entry.after;
  if (!after?.dropped || !after?.moved) throw new Error('Fusión sin datos para deshacer.');
  const { dropped, moved } = after;
  const kept = entry.entity_id;
  // Revivir al duplicado.
  await db.query('UPDATE persons SET deleted_at=NULL WHERE id=$1', [dropped]);
  // Devolver referencias simples.
  const back = async (table, column, ids) => {
    if (!ids?.length) return;
    await db.query(`UPDATE ${table} SET ${column}=$1 WHERE id = ANY($2)`, [dropped, ids]);
  };
  await back('parent_links', 'parent_id', (moved.links_as_parent ?? []).map((r) => r.id));
  await back('parent_links', 'child_id', (moved.links_as_child ?? []).map((r) => r.id));
  // Reinsertar vínculos borrados por duplicados.
  for (const r of moved.links_deleted ?? []) {
    await db.query(
      `INSERT INTO parent_links (id, created_at, created_by, deleted_at, parent_id, child_id, kind, certainty)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [r.id, r.created_at, r.created_by, r.parent_id, r.child_id, r.kind, r.certainty]);
  }
  const remapUnion = async (ids) => {
    for (const id of ids ?? []) {
      await db.query(`UPDATE unions SET
        person_a_id=CASE WHEN person_a_id=$1 THEN $2 ELSE person_a_id END,
        person_b_id=CASE WHEN person_b_id=$1 THEN $2 ELSE person_b_id END
        WHERE id=$3`, [kept, dropped, id]);
    }
  };
  await remapUnion((moved.unions ?? []).map((r) => r.id));
  // Reabrir uniones borradas por duplicadas/consigo misma.
  for (const u of moved.unions_deleted ?? []) {
    await db.query('UPDATE unions SET deleted_at=NULL WHERE id=$1', [u.id]);
  }
  await back('stories', 'person_id', (moved.stories ?? []).map((r) => r.id));
  await back('facts', 'person_id', (moved.facts ?? []).map((r) => r.id));
  await back('users', 'person_id', (moved.users ?? []).map((r) => r.id));
  await back('invites', 'target_person_id', (moved.invites ?? []).map((r) => r.id));
  await back('branches', 'founder_person_id', (moved.branches ?? []).map((r) => r.id));
  // Menciones/etiquetas: devolver las que se movieron (las que ahora apuntan a kept).
  for (const m of moved.story_mentions ?? []) {
    await db.query('UPDATE story_mentions SET person_id=$1 WHERE story_id=$2 AND person_id=$3', [dropped, m.story_id, kept]);
  }
  for (const m of moved.photo_tags ?? []) {
    await db.query('UPDATE photo_tags SET person_id=$1 WHERE photo_id=$2 AND person_id=$3', [dropped, m.photo_id, kept]);
  }
  await db.query(`UPDATE merge_candidates SET status='pending' WHERE status='merged' AND
    ((person_a_id=$1 AND person_b_id=$2) OR (person_a_id=$2 AND person_b_id=$1))`, [kept, dropped]);
  await db.query(
    `INSERT INTO change_log (entity_type, entity_id, action, before, after, user_id)
     VALUES ('person',$1,'restore',$2,$3,$4)`,
    [kept, JSON.stringify(after), JSON.stringify({ kept, dropped, undone: true }), user.id]);
}

export const ACTION_ES_LABEL = ACTION_ES;
export const ENTITY_ES_LABEL = ENTITY_ES;
