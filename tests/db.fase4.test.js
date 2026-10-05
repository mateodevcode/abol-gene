// Pruebas Fase 4: consultas recursivas, parentesco DB y estadísticas.
// Uso: npm run test:db
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getTreeAround, getDescendants, getAncestors, getSiblings, getUnclesAunts, getCousins } from '../src/lib/db/tree.js';
import { getKinship } from '../src/lib/db/kinship.js';
import { getStats } from '../src/lib/db/stats.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = { query: (t, p) => pool.query(t, p) };

async function demoId(given, paternal, maternal, year) {
  const { rows: [r] } = await pool.query(
    `SELECT id FROM persons WHERE given_names=$1 AND paternal_surname=$2 AND maternal_surname=$3
      AND EXTRACT(YEAR FROM birth_date)=$4 AND birth_place IS NULL AND deleted_at IS NULL LIMIT 1`,
    [given, paternal, maternal, year]);
  assert.ok(r, `demo ${given}`);
  return r.id;
}

before(async () => {});
after(async () => { await pool.end(); });

describe('Fase 4: árbol alrededor y descendencia', () => {
  it('incluye parejas y hermanos (José + Rosa + hijos)', async () => {
    const jose = await demoId('José María', 'García', 'López', 1880);
    const rosa = await demoId('Rosa', 'Martínez', 'Ruiz', 1885);
    const t = await getTreeAround(db, jose, { up: 1, down: 1 });
    const ids = new Set(t.persons.map((p) => p.id));
    assert.ok(ids.has(rosa), 'incluye a su pareja Rosa');
    for (const name of ['Francisco', 'Carmen', 'Pedro', 'Ana']) {
      assert.ok(t.persons.some((p) => p.given_names === name), `incluye hijo ${name}`);
    }
    assert.ok(t.unions.some((u) =>
      [u.person_a_id, u.person_b_id].includes(jose) && [u.person_a_id, u.person_b_id].includes(rosa)));
    assert.equal(t.focus, jose);
  });

  it('rechaza persona inexistente', async () => {
    await assert.rejects(getTreeAround(db, '00000000-0000-0000-0000-000000000000', {}), /no encontrada/);
  });

  it('descendencia de Carmen: 12 grupos de hijos, con nietos', async () => {
    const carmen = await demoId('Carmen', 'García', 'Martínez', 1912);
    const d = await getDescendants(db, carmen, {});
    assert.equal(d.children.length, 12);
    assert.ok(d.total > 12, `${d.total} con nietos`);
    assert.ok(d.generations >= 2, `${d.generations} generaciones`);
    for (const g of d.children) assert.ok(g.child, 'cada grupo tiene su hijo raíz');
  });

  it('descendencia de José: 4 grupos y 4+ generaciones', async () => {
    const jose = await demoId('José María', 'García', 'López', 1880);
    const d = await getDescendants(db, jose, {});
    assert.equal(d.children.length, 4);
    assert.ok(d.total >= 20, `${d.total} descendientes`);
    assert.ok(d.generations >= 4, `${d.generations} generaciones`);
    const carmenG = d.children.find((g) => g.child.given_names === 'Carmen');
    assert.ok(carmenG && carmenG.count >= 12, 'rama de Carmen con sus 12+');
  });
});

describe('Fase 4: ascendencia y colaterales', () => {
  it('ascendencia de Gael llega a José (5+ niveles)', async () => {
    const gael = await demoId('Gael', 'Rojas', 'Valeria', 2024);
    const jose = await demoId('José María', 'García', 'López', 1880);
    const a = await getAncestors(db, gael, {});
    const depths = new Map(a.map((p) => [p.id, p.depth]));
    assert.equal(depths.get(jose) >= 5, true, 'José a 5+ generaciones');
    assert.ok(a.some((p) => p.given_names === 'Valeria' && p.depth === 1));
  });

  it('Raúl: 1 hermana completa y 10 medios', async () => {
    const raul = await demoId('Raúl', 'Hernández', 'García', 1931);
    const { full, half } = await getSiblings(db, raul);
    assert.equal(full.length, 1);
    assert.equal(full[0].given_names, 'Sonia');
    assert.equal(half.length, 10);
  });

  it('Teresa: 9 completos y 2 medios', async () => {
    const teresa = await demoId('Teresa', 'Torres', 'García', 1962);
    const { full, half } = await getSiblings(db, teresa);
    assert.equal(full.length, 9);
    assert.equal(half.length, 2);
  });

  it('tíos de Valeria incluyen a Diego (por Gabriela)', async () => {
    const valeria = await demoId('Valeria', 'Rojas', 'Salas', 2000);
    const uncles = await getUnclesAunts(db, valeria);
    const diego = uncles.find((u) => u.given_names === 'Diego');
    assert.ok(diego, 'Diego es tío (medio hermano de Gabriela)');
    assert.equal(diego.via_parent_name, 'Gabriela');
  });

  it('primos de Camila incluyen a Gabriela y Diego', async () => {
    const camila = await demoId('Camila', 'Torres', 'Soto', 1995);
    const cousins = await getCousins(db, camila);
    const names = cousins.map((c) => c.given_names);
    assert.ok(names.includes('Gabriela'), 'Gabriela es prima');
    assert.ok(names.includes('Diego'), 'Diego es primo');
  });
});

describe('Fase 4: parentesco en DB', () => {
  it('Mía → Gabriela es su tía segunda', async () => {
    const mia = await demoId('Mía', 'Torres', 'Camila', 2022);
    const gabriela = await demoId('Gabriela', 'Salas', 'Torres', 1975);
    const k = await getKinship(db, mia, gabriela);
    assert.equal(k.label, 'tu tía segunda');
    assert.equal(k.distanceA, 3);
    assert.equal(k.distanceB, 2);
    assert.ok(k.route.length >= 5);
  });

  it('Raúl → Teresa es su media hermana; Gael → José antepasado', async () => {
    const raul = await demoId('Raúl', 'Hernández', 'García', 1931);
    const teresa = await demoId('Teresa', 'Torres', 'García', 1962);
    assert.equal((await getKinship(db, raul, teresa)).label, 'tu media hermana');
    const gael = await demoId('Gael', 'Rojas', 'Valeria', 2024);
    const jose = await demoId('José María', 'García', 'López', 1880);
    const k = await getKinship(db, gael, jose);
    assert.match(k.label, /antepasado \(5 generaciones\)/);
  });
});

describe('Fase 4: estadísticas', () => {
  it('totales, generaciones, longeva, cumpleaños y huecos', async () => {
    const s = await getStats(db);
    assert.ok(s.total_persons >= 2050, `${s.total_persons}`);
    assert.ok(s.generations >= 6, `${s.generations} generaciones`);
    assert.ok(s.biggest_branch?.count > 100, JSON.stringify(s.biggest_branch));
    assert.ok(s.longest_lived?.years >= 70, JSON.stringify(s.longest_lived));
    assert.ok(Array.isArray(s.birthdays_this_month));
    assert.ok(s.branch_gaps.length >= 8, 'huecos por rama');
    const garcia = s.branch_gaps.find((b) => b.name === 'García');
    assert.ok(garcia && garcia.missing_parents >= 0);
  });
});
