import { logChange } from '@/lib/db/change-log';

/**
 * Detección de duplicados: similitud de nombre (pg_trgm) + cercanía de
 * fechas + padres en común. No bloquea: devuelve avisos con puntaje.
 *
 * @param {{ query: Function }} db
 * @param {{ given_names: string, paternal_surname?: string, maternal_surname?: string, nickname?: string, birth_date?: string|null, parent_ids?: string[], exclude_id?: string|null, limit?: number }} input
 * @returns {Promise<Array<{ person: any, score: number, reasons: string[] }>>}
 */
export async function findDuplicates(db, input) {
  const parts = [input.given_names, input.paternal_surname, input.maternal_surname, input.nickname]
    .filter(Boolean).join(' ');
  if (parts.trim().length < 2) return [];
  const limit = Math.min(Number(input.limit ?? 10) || 10, 20);

  // `%` usa el índice GIN; el OR con similarity() baja el umbral efectivo a
  // 0.18 para no perder nombres largos con faltas de ortografía.
  const { rows } = await db.query(
    `SELECT p.id, p.given_names, p.paternal_surname, p.maternal_surname, p.nickname,
            p.birth_date, p.birth_date_precision, p.is_living,
            similarity(p.full_name_normalized, lower(unaccent($1))) AS sim
       FROM persons p
      WHERE p.deleted_at IS NULL
        AND ($2::uuid IS NULL OR p.id <> $2)
        AND (p.full_name_normalized % lower(unaccent($1))
          OR similarity(p.full_name_normalized, lower(unaccent($1))) > 0.18)
      ORDER BY sim DESC LIMIT $3`,
    [parts, input.exclude_id ?? null, limit]);

  const parentIds = new Set(input.parent_ids ?? []);
  const out = [];
  for (const p of rows) {
    let score = Math.round(Number(p.sim) * 50) / 100; // nombre: 0..0.5
    const reasons = [`nombre parecido (${Math.round(Number(p.sim) * 100)}%)`];
    if (input.birth_date && p.birth_date) {
      const diff = Math.abs(new Date(input.birth_date) - new Date(p.birth_date)) / 86400000;
      if (diff === 0) { score += 0.3; reasons.push('misma fecha de nacimiento'); }
      else if (diff <= 366) { score += 0.15; reasons.push('fecha de nacimiento cercana'); }
    }
    if (parentIds.size > 0) {
      const { rows: pl } = await db.query(
        'SELECT parent_id FROM parent_links WHERE child_id=$1 AND deleted_at IS NULL', [p.id]);
      const common = pl.filter((r) => parentIds.has(r.parent_id)).length;
      if (common > 0) {
        score += Math.min(0.15 * common, 0.3);
        reasons.push(common === 1 ? 'un padre/madre en común' : `${common} padres en común`);
      }
    }
    out.push({ person: p, score: Math.min(Math.round(score * 100) / 100, 1), reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Rastreo global de candidatos (admin): pares con nombre muy parecido,
 * con bono por mismo año de nacimiento y padres en común. Guarda en
 * merge_candidates los que superen 0.5 y no estén ya pendientes.
 * @returns {Promise<{ scanned: number, inserted: number }>}
 */
export async function scanDuplicateCandidates(db, { threshold = 0.55, limit = 200 } = {}) {
  const { rows: pairs } = await db.query(
    `SELECT a.id AS a_id, b.id AS b_id,
            similarity(a.full_name_normalized, b.full_name_normalized) AS sim,
            a.birth_date AS a_birth, b.birth_date AS b_birth
       FROM persons a JOIN persons b
         ON a.id < b.id
        AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.full_name_normalized <> '' AND b.full_name_normalized <> ''
        AND similarity(a.full_name_normalized, b.full_name_normalized) > $1
      ORDER BY sim DESC LIMIT $2`,
    [threshold, limit]);
  let inserted = 0;
  for (const p of pairs) {
    let score = Number(p.sim) * 0.6;
    if (p.a_birth && p.b_birth) {
      const diff = Math.abs(new Date(p.a_birth) - new Date(p.b_birth)) / 86400000;
      if (diff === 0) score += 0.25;
      else if (diff <= 366) score += 0.12;
    }
    const { rows: common } = await db.query(
      `SELECT count(*)::int AS n FROM parent_links x
        JOIN parent_links y ON y.parent_id = x.parent_id AND y.deleted_at IS NULL
       WHERE x.child_id=$1 AND y.child_id=$2 AND x.deleted_at IS NULL`,
      [p.a_id, p.b_id]);
    if (common[0].n > 0) score += Math.min(0.15 * common[0].n, 0.3);
    score = Math.min(Math.round(score * 100) / 100, 1);
    if (score < 0.5) continue;
    const { rowCount } = await db.query(
      `INSERT INTO merge_candidates (person_a_id, person_b_id, score, status)
       SELECT $1, $2, $3, 'pending'
       WHERE NOT EXISTS (
         SELECT 1 FROM merge_candidates
          WHERE status='pending'
            AND ((person_a_id=$1 AND person_b_id=$2) OR (person_a_id=$2 AND person_b_id=$1))
       )`,
      [p.a_id, p.b_id, score]);
    inserted += rowCount;
  }
  return { scanned: pairs.length, inserted };
}

/** Candidatos pendientes con datos de ambas personas (pantalla admin). */
export async function listPendingCandidates(db) {
  const { rows } = await db.query(
    `SELECT m.*, row_to_json(a) AS a, row_to_json(b) AS b
       FROM merge_candidates m
       JOIN persons a ON a.id = m.person_a_id
       JOIN persons b ON b.id = m.person_b_id
      WHERE m.status='pending' AND m.deleted_at IS NULL
      ORDER BY m.score DESC LIMIT 100`);
  return rows;
}

/** Descarta un candidato (admin). */
export async function dismissCandidate(db, userId, id) {
  const { rows: [row] } = await db.query(
    "UPDATE merge_candidates SET status='dismissed' WHERE id=$1 AND status='pending' RETURNING *", [id]);
  if (!row) throw new Error('Candidato no encontrado.');
  await logChange(db, { entity_type: 'merge_candidates', entity_id: id, action: 'update', before: { status: 'pending' }, after: { status: 'dismissed' }, user_id: userId });
  return row;
}
