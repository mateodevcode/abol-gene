import { describeKinship } from '@/lib/kinship/index.js';

/**
 * Parentesco entre dos personas (DB + función pura): ancestro común más
 * cercano, distancias, etiqueta en español y ruta A→NCA→B.
 */
export async function getKinship(db, aId, bId) {
  for (const id of [aId, bId]) {
    const { rows: [p] } = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!p) throw new Error('Persona no encontrada.');
  }
  // Subgrafo de antepasados de ambos (vínculos + géneros), con tope.
  // (Los ciclos se rechazan al escribir; la función pura además limita a 30.)
  const { rows: links } = await db.query(
    `WITH RECURSIVE up AS (
       SELECT child_id, parent_id, 0 AS depth, ARRAY[child_id, parent_id] AS path
         FROM parent_links WHERE child_id IN ($1,$2) AND deleted_at IS NULL
       UNION
       SELECT pl.child_id, pl.parent_id, up.depth+1, up.path || pl.parent_id
         FROM parent_links pl JOIN up ON up.parent_id = pl.child_id
        WHERE pl.deleted_at IS NULL AND up.depth < 30
          AND NOT (pl.parent_id = ANY(up.path))
     ) SELECT DISTINCT child_id, parent_id FROM up`, [aId, bId]);
  const parents = new Map();
  for (const l of links) {
    if (!parents.has(l.child_id)) parents.set(l.child_id, []);
    if (!parents.get(l.child_id).includes(l.parent_id)) parents.get(l.child_id).push(l.parent_id);
  }
  const ids = new Set([aId, bId]);
  for (const [c, ps] of parents) { ids.add(c); for (const p of ps) ids.add(p); }
  const { rows: people } = ids.size ? await db.query(
    'SELECT id, gender FROM persons WHERE id = ANY($1) AND deleted_at IS NULL', [[...ids]]) : { rows: [] };
  const genders = new Map(people.map((p) => [p.id, p.gender]));

  const result = describeKinship(aId, bId, { parents, genders });
  if (result.commonAncestor) {
    const { rows: [nca] } = await db.query(
      'SELECT id, given_names, paternal_surname, maternal_surname FROM persons WHERE id=$1',
      [result.commonAncestor]);
    return { ...result, common_ancestor: nca ?? { id: result.commonAncestor } };
  }
  return { ...result, common_ancestor: null };
}
