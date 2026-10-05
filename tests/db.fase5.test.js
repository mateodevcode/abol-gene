// Pruebas Fase 5: ficha completa y formato. Uso: npm run test:db
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getProfile } from '../src/lib/db/profile.js';
import { getChildren, getPartners } from '../src/lib/db/tree.js';
import { formatDate, formatLifespan, factTypeEs, unionKindEs, initials, fullName } from '../src/lib/format.js';

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

describe('Fase 5: ficha de Carmen (12 hijos, 2 parejas)', () => {
  it('familia completa', async () => {
    const carmen = await demoId('Carmen', 'García', 'Martínez', 1912);
    const f = await getProfile(db, carmen);
    assert.equal(f.person.given_names, 'Carmen');
    assert.equal(f.person.branch_name, 'García');
    assert.equal(f.parents.length, 2);
    assert.equal(f.children.length, 12);
    assert.equal(f.siblings.full.length, 3, 'Francisco, Pedro y Ana');
    assert.equal(f.partners.length, 2);
    const kinds = f.partners.map((p) => p.union_kind).sort();
    assert.deepEqual(kinds, ['free_union', 'marriage']);
    assert.ok(f.counts.children === 12);
  });

  it('hechos e historias con firma y menciones', async () => {
    const carmen = await demoId('Carmen', 'García', 'Martínez', 1912);
    const f = await getProfile(db, carmen);
    assert.ok(f.facts.some((x) => /doce hijos/.test(x.value)), 'hecho de los doce');
    const s = f.stories.find((x) => x.title === 'Madre de doce');
    assert.ok(s, 'historia encontrada');
    const ms = f.mentions.filter((m) => m.story_id === s.id).map((m) => m.given_names).sort();
    assert.deepEqual(ms, ['Raúl', 'Teresa']);
    assert.equal(f.photos.length, 0, 'sin fotos aún (Fase 7)');
  });

  it('Diego: 2 padres adoptivos y 0 parejas', async () => {
    const diego = await demoId('Diego', 'Torres', 'Fernández', 2010);
    const f = await getProfile(db, diego);
    assert.equal(f.parents.length, 2);
    assert.ok(f.parents.every((p) => p.link_kind === 'adoptive'));
    assert.equal(f.partners.length, 0);
    assert.equal(f.siblings.full.length, 0);
    assert.equal(f.siblings.half.length, 1, 'Gabriela es media hermana');
  });

  it('persona inexistente falla', async () => {
    await assert.rejects(getProfile(db, '00000000-0000-0000-0000-000000000000'), /no encontrada/i);
  });
});

describe('Fase 5: hijos y parejas directos', () => {
  it('Elena: hija biológica + adoptivo; 2 uniones ordenadas', async () => {
    const elena = await demoId('Elena', 'Torres', 'García', 1948);
    const kids = await getChildren(db, elena);
    assert.equal(kids.length, 2);
    const parts = await getPartners(db, elena);
    assert.equal(parts.length, 2);
    assert.equal(parts[0].union_kind, 'marriage', 'Roberto primero (1970)');
    assert.equal(parts[1].union_kind, 'partnership', 'Lucía después (2005)');
    assert.equal(parts[0].end_reason, 'widowed');
  });
});

describe('Fase 5: formato en español', () => {
  it('fechas con precisión', () => {
    assert.equal(formatDate('1912-09-03', 'day'), '3 sep 1912');
    assert.equal(formatDate('1912-09-03', 'month'), 'sep 1912');
    assert.equal(formatDate('1912-09-03', 'year'), '1912');
    assert.equal(formatDate('1880-01-01', 'decade'), 'década de 1880');
    assert.equal(formatDate('1885-06-01', 'approximate'), 'hacia 1885');
    assert.equal(formatDate(null, 'day'), null);
    // Un Date a medianoche local (como lo devolvía pg) no debe mover el día.
    assert.equal(formatDate(new Date(2024, 4, 5), 'day'), '5 may 2024');
  });
  it('vida, nombres, etiquetas e iniciales', () => {
    assert.equal(formatLifespan({ birth_date: '1910-04-12', birth_date_precision: 'day', death_date: '1990-11-02', death_date_precision: 'day' }), '12 abr 1910 – 2 nov 1990');
    assert.equal(formatLifespan({ birth_date: '1948-01-30', birth_date_precision: 'day', is_living: true }), 'n. 30 ene 1948');
    assert.equal(fullName({ given_names: 'Ana', paternal_surname: 'Torres', maternal_surname: 'García', nickname: 'Anita' }), 'Ana Torres García "Anita"');
    assert.equal(factTypeEs('occupation'), 'Oficio');
    assert.equal(unionKindEs('free_union'), 'Unión libre');
    assert.equal(initials({ given_names: 'Carmen', paternal_surname: 'García' }), 'CG');
  });
});
