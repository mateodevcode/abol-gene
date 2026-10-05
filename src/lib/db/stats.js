/**
 * Estadísticas familiares: totales, generaciones, rama más numerosa,
 * familiar más longevo, cumpleaños del mes y ramas con huecos.
 */
export async function getStats(db) {
  const { rows: [tot] } = await db.query(
    `SELECT count(*)::int AS persons,
            count(*) FILTER (WHERE is_living)::int AS living,
            (SELECT count(*)::int FROM branches WHERE deleted_at IS NULL) AS branches,
            (SELECT count(*)::int FROM unions WHERE deleted_at IS NULL) AS unions,
            (SELECT count(*)::int FROM stories WHERE deleted_at IS NULL) AS stories,
            (SELECT count(*)::int FROM photos WHERE deleted_at IS NULL) AS photos
       FROM persons WHERE deleted_at IS NULL`);

  // Generaciones: cadena de antepasados más larga (control de ciclos + tope).
  const { rows: [gen] } = await db.query(
    `WITH RECURSIVE up AS (
       SELECT child_id AS id, parent_id AS anc, 1 AS depth, ARRAY[child_id, parent_id] AS path
         FROM parent_links WHERE deleted_at IS NULL
       UNION
       SELECT up.id, pl.parent_id, up.depth+1, up.path || pl.parent_id
         FROM parent_links pl JOIN up ON up.anc = pl.child_id
        WHERE pl.deleted_at IS NULL AND up.depth < 30 AND NOT (pl.parent_id = ANY(up.path))
     ) SELECT COALESCE(max(depth), 0)::int + 1 AS generations FROM up`);

  const { rows: [big] } = await db.query(
    `SELECT b.id, b.name, b.color, count(p.id)::int AS count
       FROM branches b LEFT JOIN persons p ON p.branch_id = b.id AND p.deleted_at IS NULL
      WHERE b.deleted_at IS NULL GROUP BY b.id ORDER BY count DESC LIMIT 1`);

  const { rows: [old] } = await db.query(
    `SELECT given_names, paternal_surname, maternal_surname, birth_date, death_date,
            EXTRACT(YEAR FROM age(death_date, birth_date))::int AS years
       FROM persons
      WHERE deleted_at IS NULL AND NOT is_living
        AND birth_date IS NOT NULL AND death_date IS NOT NULL
      ORDER BY death_date - birth_date DESC LIMIT 1`);

  const { rows: birthdays } = await db.query(
    `SELECT id, given_names, paternal_surname, maternal_surname,
            EXTRACT(DAY FROM birth_date)::int AS day,
            EXTRACT(YEAR FROM birth_date)::int AS year
       FROM persons
      WHERE deleted_at IS NULL AND is_living AND birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      ORDER BY day LIMIT 31`);

  // Huecos por rama: sin fecha de nacimiento o con menos de 2 padres conocidos.
  const { rows: gaps } = await db.query(
    `SELECT b.id, b.name, b.color, count(p.id)::int AS persons,
            count(*) FILTER (WHERE p.birth_date IS NULL)::int AS missing_birth,
            count(*) FILTER (WHERE COALESCE(pl.n, 0) < 2)::int AS missing_parents
       FROM branches b
       JOIN persons p ON p.branch_id = b.id AND p.deleted_at IS NULL
       LEFT JOIN (SELECT child_id, count(*)::int AS n FROM parent_links
                  WHERE deleted_at IS NULL GROUP BY child_id) pl ON pl.child_id = p.id
      WHERE b.deleted_at IS NULL
      GROUP BY b.id ORDER BY (count(*) FILTER (WHERE p.birth_date IS NULL))
        + (count(*) FILTER (WHERE COALESCE(pl.n, 0) < 2)) DESC`);

  return {
    total_persons: tot.persons, living: tot.living, branches: tot.branches,
    unions: tot.unions, stories: tot.stories, photos: tot.photos,
    generations: gen.generations, biggest_branch: big ?? null,
    longest_lived: old ?? null, birthdays_this_month: birthdays, branch_gaps: gaps,
  };
}
