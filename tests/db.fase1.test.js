// Pruebas Fase 1: modelo, seed demo, sintéticos y constraints.
// Uso: npm run test:db
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

before(async () => { await db.connect(); });
after(async () => { await db.end(); });

async function personId(given, paternal, maternal, year) {
  const { rows } = await db.query(
    `SELECT id FROM persons
      WHERE given_names=$1 AND paternal_surname=$2 AND maternal_surname=$3
        AND EXTRACT(YEAR FROM birth_date)=$4 AND birth_place IS NULL AND deleted_at IS NULL LIMIT 1`,
    [given, paternal, maternal, year]);
  assert.ok(rows[0], `existe ${given} ${paternal} ${maternal} (${year})`);
  return rows[0].id;
}

describe('Fase 1: extensiones y tablas', () => {
  it('pg_trgm y unaccent instaladas', async () => {
    const { rows } = await db.query(
      "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent')");
    assert.deepEqual(rows.map((r) => r.extname).sort(), ['pg_trgm', 'unaccent']);
  });

  it('existen las 13 tablas del modelo', async () => {
    const { rows } = await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('schema_migrations') ORDER BY 1`);
    const names = rows.map((r) => r.tablename);
    for (const t of ['branches', 'persons', 'parent_links', 'unions', 'stories', 'story_mentions',
      'facts', 'photos', 'photo_tags', 'users', 'invites', 'change_log', 'merge_candidates']) {
      assert.ok(names.includes(t), `tabla ${t}`);
    }
  });
});

describe('Fase 1: familia demo', () => {
  it('Carmen García Martínez tiene exactamente 12 hijos', async () => {
    const id = await personId('Carmen', 'García', 'Martínez', 1912);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM parent_links pl
        JOIN persons c ON c.id = pl.child_id
       WHERE pl.parent_id=$1 AND pl.deleted_at IS NULL AND c.deleted_at IS NULL`, [id]);
    // Carmen García (1912) es la madre de los 12; Carmen Ruiz (1888) tiene 2.
    assert.equal(rows[0].n, 12);
  });

  it('Raúl y Teresa son medios hermanos (misma madre, distinto padre)', async () => {
    const raul = await personId('Raúl', 'Hernández', 'García', 1931);
    const teresa = await personId('Teresa', 'Torres', 'García', 1962);
    const { rows } = await db.query(
      `SELECT pl.child_id, array_agg(pl.parent_id) AS padres
         FROM parent_links pl
        WHERE pl.child_id IN ($1,$2) AND pl.kind='biological' AND pl.deleted_at IS NULL
        GROUP BY pl.child_id`, [raul, teresa]);
    assert.equal(rows.length, 2);
    const [a, b] = rows.map((r) => r.padres);
    const comun = a.filter((x) => b.includes(x));
    assert.equal(comun.length, 1, 'comparten exactamente un padre');
  });

  it('Diego tiene 2 padres adoptivos (pareja del mismo sexo)', async () => {
    const id = await personId('Diego', 'Torres', 'Fernández', 2010);
    const { rows } = await db.query(
      `SELECT kind, count(*)::int AS n FROM parent_links
        WHERE child_id=$1 AND deleted_at IS NULL GROUP BY kind`, [id]);
    assert.deepEqual(rows, [{ kind: 'adoptive', n: 2 }]);
  });

  it('Elena tiene 2 uniones: matrimonio (viudez) + pareja del mismo sexo', async () => {
    const id = await personId('Elena', 'Torres', 'García', 1948);
    const { rows } = await db.query(
      'SELECT kind, end_reason FROM unions WHERE (person_a_id=$1 OR person_b_id=$1) AND deleted_at IS NULL',
      [id]);
    const kinds = rows.map((r) => r.kind).sort();
    assert.deepEqual(kinds, ['marriage', 'partnership']);
    assert.ok(rows.some((r) => r.end_reason === 'widowed'));
  });

  it('profundidad mínima de 5 generaciones (Gael -> ... -> José)', async () => {
    const gael = await personId('Gael', 'Rojas', 'Valeria', 2024);
    const { rows } = await db.query(
      `WITH RECURSIVE up AS (
         SELECT $1::uuid AS id, 0 AS depth
         UNION
         SELECT pl.parent_id, up.depth + 1 FROM parent_links pl
         JOIN up ON up.id = pl.child_id
        WHERE pl.deleted_at IS NULL AND up.depth < 10
       ) SELECT max(depth)::int AS maxdepth FROM up`, [gael]);
    assert.ok(rows[0].maxdepth >= 5, `profundidad ${rows[0].maxdepth}`);
  });

  it('búsqueda trigram tolera errores y el normalizado no tiene tildes', async () => {
    const { rows } = await db.query(
      `SELECT given_names, paternal_surname, similarity(full_name_normalized, 'garsia martines') AS s
         FROM persons WHERE full_name_normalized % 'garsia martines'
         ORDER BY s DESC LIMIT 3`);
    assert.ok(rows.length > 0, 'encuentra García con falta de ortografía');
    const { rows: [n] } = await db.query(
      "SELECT full_name_normalized FROM persons WHERE given_names='José María' LIMIT 1");
    assert.ok(!/[áéíóúñ]/i.test(n.full_name_normalized), n.full_name_normalized);
  });
});

describe('Fase 1: constraints', () => {
  it('rechaza self-parent y self-union', async () => {
    const id = await personId('Teresa', 'Torres', 'García', 1962);
    await assert.rejects(db.query('INSERT INTO parent_links (parent_id, child_id) VALUES ($1,$1)', [id]));
    await assert.rejects(db.query(
      "INSERT INTO unions (person_a_id, person_b_id) VALUES ($1,$1)", [id]));
  });

  it('rechaza vínculo duplicado y kind inválido', async () => {
    const a = await personId('Teresa', 'Torres', 'García', 1962);
    const b = await personId('Gael', 'Rojas', 'Valeria', 2024);
    await db.query('DELETE FROM parent_links WHERE parent_id=$1 AND child_id=$2', [a, b]);
    await db.query('INSERT INTO parent_links (parent_id, child_id) VALUES ($1,$2)', [a, b]);
    await assert.rejects(db.query(
      'INSERT INTO parent_links (parent_id, child_id) VALUES ($1,$2)', [a, b]));
    await assert.rejects(db.query(
      "INSERT INTO parent_links (parent_id, child_id, kind) VALUES ($1,$2,'clon')", [a, b]));
    await db.query('DELETE FROM parent_links WHERE parent_id=$1 AND child_id=$2', [a, b]);
  });

  it('rechaza color de rama inválido', async () => {
    await assert.rejects(db.query(
      "INSERT INTO branches (name, color) VALUES ('Test','rojo')"));
  });

  it('no hay ciclos en parent_links (grafo completo)', async () => {
    const { rows } = await db.query(
      `WITH RECURSIVE chain AS (
         SELECT parent_id, child_id, ARRAY[parent_id] AS path, false AS is_cycle
           FROM parent_links WHERE deleted_at IS NULL
         UNION ALL
         SELECT c.parent_id, pl.child_id, c.path || pl.parent_id, pl.parent_id = ANY(c.path)
           FROM parent_links pl JOIN chain c ON c.child_id = pl.parent_id
          WHERE pl.deleted_at IS NULL AND NOT c.is_cycle
       ) SELECT count(*)::int AS ciclos FROM chain WHERE is_cycle`);
    assert.equal(rows[0].ciclos, 0);
  });
});

describe('Fase 1: sintéticos', () => {
  it('hay 2000+ personas en total', async () => {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM persons WHERE deleted_at IS NULL');
    assert.ok(rows[0].n >= 2050, `${rows[0].n} personas`);
  });
});
