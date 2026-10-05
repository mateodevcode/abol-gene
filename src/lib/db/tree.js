/**
 * Consultas recursivas del árbol (todas con control de ciclos vía path
 * y tope de profundidad). Solo personas y vínculos no borrados.
 */

const PERSON_COLS = `p.id, p.given_names, p.paternal_surname, p.maternal_surname, p.nickname,
  p.gender, p.birth_date, p.birth_date_precision, p.birth_place,
  p.death_date, p.death_date_precision, p.is_living, p.branch_id, p.cover_photo_id,
  b.name AS branch_name, b.color AS branch_color`;

function personByIds(db, ids) {
  if (ids.length === 0) return Promise.resolve([]);
  return db.query(
    `SELECT ${PERSON_COLS} FROM persons p LEFT JOIN branches b ON b.id = p.branch_id
      WHERE p.id = ANY($1) AND p.deleted_at IS NULL`, [ids]).then((r) => r.rows);
}

/** Hijos directos de una persona. */
export async function getChildren(db, personId) {
  const { rows } = await db.query(
    `SELECT ${PERSON_COLS}, pl.kind AS link_kind, pl.certainty AS link_certainty
       FROM parent_links pl
       JOIN persons p ON p.id = pl.child_id LEFT JOIN branches b ON b.id = p.branch_id
      WHERE pl.parent_id=$1 AND pl.deleted_at IS NULL AND p.deleted_at IS NULL
      ORDER BY p.birth_date`, [personId]);
  return rows;
}

/** Parejas de una persona (unión + datos de la otra persona). */
export async function getPartners(db, personId) {
  const { rows } = await db.query(
    `SELECT u.id AS union_id, u.kind AS union_kind, u.start_date, u.start_date_precision,
            u.end_date, u.end_date_precision, u.end_reason, ${PERSON_COLS}
       FROM unions u
       JOIN persons p ON p.id = CASE WHEN u.person_a_id=$1 THEN u.person_b_id ELSE u.person_a_id END
       LEFT JOIN branches b ON b.id = p.branch_id
      WHERE (u.person_a_id=$1 OR u.person_b_id=$1) AND u.deleted_at IS NULL AND p.deleted_at IS NULL
      ORDER BY u.start_date`, [personId]);
  return rows;
}

/**
 * Árbol alrededor de una persona: N generaciones arriba y M abajo,
 * más hermanos (hijos de los padres incluidos), co-padres (padres de los
 * incluidos, aunque no sean pareja del foco) y parejas de todos.
 * Con `full: true` ignora la ventana y trae el componente conectado completo
 * (padres + hijos + parejas hasta estabilizar) más las personas sueltas.
 * @returns {{ focus: string, persons: any[], parent_links: any[], unions: any[] }}
 */
export async function getTreeAround(db, personId, { up = 2, down = 2, full = false } = {}) {
  up = Math.min(Math.max(Number(up) || 0, 0), 30);
  down = Math.min(Math.max(Number(down) || 0, 0), 30);
  const me = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [personId]);
  if (!me.rows[0]) throw new Error('Persona no encontrada.');

  const { rows: anc } = await db.query(
    `WITH RECURSIVE a AS (
       SELECT parent_id AS id, 1 AS depth, ARRAY[parent_id] AS path
         FROM parent_links WHERE child_id=$1 AND deleted_at IS NULL
       UNION
       SELECT pl.parent_id, a.depth+1, a.path || pl.parent_id
         FROM parent_links pl JOIN a ON a.id = pl.child_id
        WHERE pl.deleted_at IS NULL AND a.depth < $2 AND NOT (pl.parent_id = ANY(a.path))
     ) SELECT id FROM a`, [personId, Math.max(up, 1)]);
  const { rows: desc } = await db.query(
    `WITH RECURSIVE d AS (
       SELECT child_id AS id, 1 AS depth, ARRAY[child_id] AS path
         FROM parent_links WHERE parent_id=$1 AND deleted_at IS NULL
       UNION
       SELECT pl.child_id, d.depth+1, d.path || pl.child_id
         FROM parent_links pl JOIN d ON d.id = pl.parent_id
        WHERE pl.deleted_at IS NULL AND d.depth < $2 AND NOT (pl.child_id = ANY(d.path))
     ) SELECT id FROM d`, [personId, Math.max(down, 1)]);

  const core = new Set([personId, ...anc.map((r) => r.id), ...desc.map((r) => r.id)]);

  // Hermanos: otros hijos de los padres de cualquiera del núcleo.
  const { rows: sibs } = core.size ? await db.query(
    `SELECT DISTINCT pl2.child_id AS id FROM parent_links pl1
       JOIN parent_links pl2 ON pl2.parent_id = pl1.parent_id AND pl2.deleted_at IS NULL
      WHERE pl1.child_id = ANY($1) AND pl1.deleted_at IS NULL`, [[...core]]) : { rows: [] };
  for (const r of sibs) core.add(r.id);

  // Co-padres: padres de los incluidos (la madre aunque no sea pareja del foco).
  // En modo full se itera padres + hijos + parejas hasta cerrar el componente.
  for (let round = 0; round < (full ? 20 : 1); round++) {
    const before = core.size;
    const arr = [...core];
    const [par, chi, part] = await Promise.all([
      db.query(
        `SELECT DISTINCT pl.parent_id AS id FROM parent_links pl
          JOIN persons p ON p.id = pl.parent_id AND p.deleted_at IS NULL
         WHERE pl.child_id = ANY($1) AND pl.deleted_at IS NULL`, [arr]),
      full ? db.query(
        `SELECT DISTINCT pl.child_id AS id FROM parent_links pl
          JOIN persons p ON p.id = pl.child_id AND p.deleted_at IS NULL
         WHERE pl.parent_id = ANY($1) AND pl.deleted_at IS NULL`, [arr]) : { rows: [] },
      db.query(
        `SELECT DISTINCT CASE WHEN person_a_id = ANY($1) THEN person_b_id ELSE person_a_id END AS id
           FROM unions WHERE deleted_at IS NULL AND (person_a_id = ANY($1) OR person_b_id = ANY($1))`,
        [arr]),
    ]);
    for (const r of [...par.rows, ...chi.rows, ...part.rows]) core.add(r.id);
    if (core.size === before) break;
  }
  if (full) {
    // Personas sueltas (sin ningún vínculo ni unión): también son familia.
    const { rows: orphans } = await db.query(
      `SELECT p.id FROM persons p WHERE p.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM parent_links pl WHERE pl.deleted_at IS NULL AND (pl.parent_id = p.id OR pl.child_id = p.id))
         AND NOT EXISTS (SELECT 1 FROM unions u WHERE u.deleted_at IS NULL AND (u.person_a_id = p.id OR u.person_b_id = p.id))`);
    for (const r of orphans) core.add(r.id);
  }

  // (El bucle ya trae parejas; no hace falta repetirlo.)

  const ids = [...core];
  const [persons, links, unions] = await Promise.all([
    personByIds(db, ids),
    ids.length ? db.query(
      `SELECT * FROM parent_links WHERE deleted_at IS NULL
         AND parent_id = ANY($1) AND child_id = ANY($1)`, [ids]).then((r) => r.rows) : [],
    ids.length ? db.query(
      `SELECT * FROM unions WHERE deleted_at IS NULL
         AND person_a_id = ANY($1) AND person_b_id = ANY($1)`, [ids]).then((r) => r.rows) : [],
  ]);
  return { focus: personId, persons, parent_links: links, unions };
}

/**
 * Descendencia agrupada por hijo y por generación, con conteo total.
 * @returns {{ total: number, generations: number, children: Array<{ child: any, count: number, byGeneration: Record<number,any[]> }> }}
 */
export async function getDescendants(db, personId, { maxDepth = 10 } = {}) {
  const { rows } = await db.query(
    `WITH RECURSIVE d AS (
       SELECT pl.child_id AS id, pl.child_id AS root, 1 AS depth, ARRAY[pl.child_id] AS path
         FROM parent_links pl WHERE pl.parent_id=$1 AND pl.deleted_at IS NULL
       UNION
       SELECT pl.child_id, d.root, d.depth+1, d.path || pl.child_id
         FROM parent_links pl JOIN d ON d.id = pl.parent_id
        WHERE pl.deleted_at IS NULL AND d.depth < $2 AND NOT (pl.child_id = ANY(d.path))
     ) SELECT ${PERSON_COLS}, d.root AS root_id, d.depth
         FROM d JOIN persons p ON p.id = d.id LEFT JOIN branches b ON b.id = p.branch_id
        WHERE p.deleted_at IS NULL ORDER BY d.depth, p.birth_date`,
    [personId, Math.min(Math.max(Number(maxDepth) || 10, 1), 20)]);
  const byRoot = new Map();
  let maxGen = 0;
  for (const r of rows) {
    maxGen = Math.max(maxGen, r.depth);
    if (!byRoot.has(r.root_id)) byRoot.set(r.root_id, { child: null, count: 0, byGeneration: {} });
    const g = byRoot.get(r.root_id);
    g.count++;
    (g.byGeneration[r.depth] ??= []).push(r);
    if (r.depth === 1) g.child = r;
  }
  return { total: rows.length, generations: maxGen, children: [...byRoot.values()] };
}

/** Ascendencia hasta donde llegue el árbol, ordenada por generación. */
export async function getAncestors(db, personId, { maxDepth = 20 } = {}) {
  const { rows } = await db.query(
    `WITH RECURSIVE a AS (
       SELECT pl.parent_id AS id, 1 AS depth, ARRAY[pl.parent_id] AS path
         FROM parent_links pl WHERE pl.child_id=$1 AND pl.deleted_at IS NULL
       UNION
       SELECT pl.parent_id, a.depth+1, a.path || pl.parent_id
         FROM parent_links pl JOIN a ON a.id = pl.child_id
        WHERE pl.deleted_at IS NULL AND a.depth < $2 AND NOT (pl.parent_id = ANY(a.path))
     ) SELECT ${PERSON_COLS}, a.depth
         FROM a JOIN persons p ON p.id = a.id LEFT JOIN branches b ON b.id = p.branch_id
        WHERE p.deleted_at IS NULL ORDER BY a.depth, p.birth_date`,
    [personId, Math.min(Math.max(Number(maxDepth) || 20, 1), 30)]);
  return rows;
}

async function parentIdsOf(db, personId) {
  const { rows } = await db.query(
    'SELECT parent_id FROM parent_links WHERE child_id=$1 AND deleted_at IS NULL', [personId]);
  return rows.map((r) => r.parent_id);
}

/** Hermanos y medios hermanos (mismo juego de padres conocidos = hermanos). */
export async function getSiblings(db, personId) {
  const mine = await parentIdsOf(db, personId);
  if (mine.length === 0) return { full: [], half: [] };
  const { rows } = await db.query(
    `SELECT ${PERSON_COLS}
       FROM parent_links pl JOIN persons p ON p.id = pl.child_id
       LEFT JOIN branches b ON b.id = p.branch_id
      WHERE pl.parent_id = ANY($1) AND pl.deleted_at IS NULL
        AND p.id <> $2 AND p.deleted_at IS NULL
      GROUP BY p.id, b.name, b.color`, [mine, personId]);
  const ids = rows.map((r) => r.id);
  const { rows: links } = ids.length ? await db.query(
    'SELECT child_id, parent_id FROM parent_links WHERE child_id = ANY($1) AND deleted_at IS NULL', [ids])
    : { rows: [] };
  const byChild = new Map();
  for (const l of links) (byChild.get(l.child_id) ?? byChild.set(l.child_id, []).get(l.child_id)).push(l.parent_id);
  const full = [];
  const half = [];
  const mySet = new Set(mine);
  for (const r of rows) {
    const tSet = new Set(byChild.get(r.id) ?? []);
    const same = mySet.size === tSet.size && [...mySet].every((x) => tSet.has(x));
    (same ? full : half).push(r);
  }
  return { full, half };
}

/** Tíos y tías (hermanos de los padres), indicando por qué lado. */
export async function getUnclesAunts(db, personId) {
  const parents = await parentIdsOf(db, personId);
  const out = [];
  for (const pid of parents) {
    const { full, half } = await getSiblings(db, pid);
    const { rows: [p] } = await db.query(
      'SELECT given_names, gender FROM persons WHERE id=$1', [pid]);
    for (const u of [...full, ...half]) out.push({ ...u, via_parent_id: pid, via_parent_name: p?.given_names ?? null });
  }
  return out;
}

/** Primos y primas (hijos de tíos/tías). */
export async function getCousins(db, personId) {
  const uncles = await getUnclesAunts(db, personId);
  const out = [];
  const seen = new Set();
  for (const u of uncles) {
    const { rows } = await db.query(
      `SELECT ${PERSON_COLS} FROM parent_links pl
         JOIN persons p ON p.id = pl.child_id LEFT JOIN branches b ON b.id = p.branch_id
        WHERE pl.parent_id=$1 AND pl.deleted_at IS NULL AND p.id <> $2 AND p.deleted_at IS NULL`,
      [u.id, personId]);
    for (const c of rows) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, via_uncle_id: u.id });
    }
  }
  return out;
}
