// Pruebas Fase 3: CRUD, ciclos, duplicados y change_log en transacción.
// Uso: npm run test:db
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { withTransaction } from '../src/lib/db/client.js';
import { createPerson, updatePerson, deletePerson, getPerson } from '../src/lib/db/persons.js';
import { addParentLink, removeParentLink, createUnion, updateUnion, deleteUnion } from '../src/lib/db/relations.js';
import { findDuplicates } from '../src/lib/db/duplicates.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = { query: (t, p) => pool.query(t, p) };
const T = (s) => `fase3-${s}-${Date.now()}`;

let testerId;
const trashPersons = [];
const trashLinks = [];
const trashUnions = [];

async function demoId(given, paternal, maternal, year) {
  const { rows: [r] } = await pool.query(
    `SELECT id FROM persons WHERE given_names=$1 AND paternal_surname=$2 AND maternal_surname=$3
      AND EXTRACT(YEAR FROM birth_date)=$4 AND birth_place IS NULL AND deleted_at IS NULL LIMIT 1`,
    [given, paternal, maternal, year]);
  assert.ok(r, `demo ${given}`);
  return r.id;
}

async function logCount(entityId, action) {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM change_log WHERE entity_id=$1 AND action=$2', [entityId, action]);
  return rows[0].n;
}

before(async () => {
  const { rows: [u] } = await pool.query(
    "INSERT INTO users (email, name, role) VALUES ($1,'Fase3 Tester','member') RETURNING id",
    [T('tester') + '@test.local']);
  testerId = u.id;
});

after(async () => {
  if (trashUnions.length) {
    await pool.query('DELETE FROM change_log WHERE entity_id = ANY($1)', [trashUnions]);
    await pool.query('DELETE FROM unions WHERE id = ANY($1)', [trashUnions]);
  }
  if (trashLinks.length) {
    const { rows } = await pool.query('SELECT id FROM parent_links WHERE id = ANY($1)', [trashLinks]);
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await pool.query('DELETE FROM change_log WHERE entity_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM parent_links WHERE id = ANY($1)', [ids]);
    }
  }
  if (trashPersons.length) {
    await pool.query('DELETE FROM change_log WHERE entity_id = ANY($1)', [trashPersons]);
    await pool.query('DELETE FROM parent_links WHERE child_id = ANY($1) OR parent_id = ANY($1)', [trashPersons]);
    await pool.query('DELETE FROM persons WHERE id = ANY($1)', [trashPersons]);
  }
  await pool.query('DELETE FROM change_log WHERE user_id=$1', [testerId]);
  await pool.query('DELETE FROM users WHERE id=$1', [testerId]);
  await pool.end();
});

describe('Fase 3: CRUD de personas', () => {
  it('crea, edita y borra (lógico) con change_log', async () => {
    const p = await withTransaction((tx) => createPerson(tx, testerId, {
      given_names: 'Prueba', paternal_surname: 'Fase', maternal_surname: 'Tres',
      birth_date: '1990-05-05', birth_date_precision: 'day',
    }));
    trashPersons.push(p.id);
    assert.equal(p.full_name_normalized, 'prueba fase tres');
    assert.equal(await logCount(p.id, 'create'), 1);

    const got = await getPerson(db, p.id);
    assert.equal(got.given_names, 'Prueba');

    const edited = await withTransaction((tx) => updatePerson(tx, testerId, p.id, { nickname: 'Prob' }));
    assert.equal(edited.nickname, 'Prob');
    assert.equal(await logCount(p.id, 'update'), 1);
    const { rows: [lg] } = await pool.query(
      "SELECT before, after FROM change_log WHERE entity_id=$1 AND action='update'", [p.id]);
    assert.equal(lg.before.nickname, null);
    assert.equal(lg.after.nickname, 'Prob');

    await withTransaction((tx) => deletePerson(tx, testerId, p.id));
    assert.equal(await getPerson(db, p.id), null);
    assert.equal(await logCount(p.id, 'delete'), 1);
  });

  it('valida: nombre, fechas, precisión y rama', async () => {
    await assert.rejects(withTransaction((tx) => createPerson(tx, testerId, { given_names: '  ' })), /nombre/i);
    await assert.rejects(withTransaction((tx) => createPerson(tx, testerId, {
      given_names: 'X', birth_date: '1990-01-01', death_date: '1980-01-01',
    })), /anterior al nacimiento/);
    await assert.rejects(withTransaction((tx) => createPerson(tx, testerId, {
      given_names: 'X', birth_date: '2990-01-01',
    })), /futuro/);
    await assert.rejects(withTransaction((tx) => createPerson(tx, testerId, {
      given_names: 'X', birth_date_precision: 'siglo',
    })), /Precisión/);
    await assert.rejects(withTransaction((tx) => createPerson(tx, testerId, {
      given_names: 'X', branch_id: '00000000-0000-0000-0000-000000000000',
    })), /rama/);
  });
});

describe('Fase 3: vínculos y ciclos', () => {
  it('agrega y quita vínculo con change_log', async () => {
    const teresa = await demoId('Teresa', 'Torres', 'García', 1962);
    const mia = await demoId('Mía', 'Torres', 'Camila', 2022);
    const link = await withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: teresa, child_id: mia, kind: 'step', certainty: 'unconfirmed',
    }));
    trashLinks.push(link.id);
    assert.equal(link.kind, 'step');
    assert.equal(await logCount(link.id, 'create'), 1);
    await assert.rejects(withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: teresa, child_id: mia,
    })), /ya existe/);
    await withTransaction((tx) => removeParentLink(tx, testerId, teresa, mia));
    assert.equal(await logCount(link.id, 'delete'), 1);
  });

  it('rechaza self-parent y ciclos con mensaje claro', async () => {
    const jose = await demoId('José María', 'García', 'López', 1880);
    const gael = await demoId('Gael', 'Rojas', 'Valeria', 2024);
    await assert.rejects(withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: jose, child_id: jose,
    })), /sí misma/);
    // Gael es descendiente de José: invertir la relación es un ciclo.
    await assert.rejects(withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: gael, child_id: jose,
    })), /ciclo/);
  });

  it('la transacción revierte todo si el vínculo falla', async () => {
    const jose = await demoId('José María', 'García', 'López', 1880);
    const gael = await demoId('Gael', 'Rojas', 'Valeria', 2024);
    let createdId = null;
    await assert.rejects(withTransaction(async (tx) => {
      const p = await createPerson(tx, testerId, { given_names: 'Temporal', paternal_surname: 'Rollback' });
      createdId = p.id;
      await addParentLink(tx, testerId, { parent_id: gael, child_id: jose }); // ciclo -> falla
    }), /ciclo/);
    const gone = await pool.query('SELECT id FROM persons WHERE id=$1', [createdId]);
    assert.equal(gone.rows.length, 0, 'la persona temporal no quedó guardada');
  });
});

describe('Fase 3: uniones', () => {
  it('crea, edita y borra con change_log; valida', async () => {
    const teresa = await demoId('Teresa', 'Torres', 'García', 1962);
    const luis = await demoId('Luis', 'Torres', 'García', 1956);
    const u = await withTransaction((tx) => createUnion(tx, testerId, {
      person_a_id: teresa, person_b_id: luis, kind: 'free_union',
      start_date: '1985-01-01', start_date_precision: 'year',
    }));
    trashUnions.push(u.id);
    assert.equal(await logCount(u.id, 'create'), 1);
    const ed = await withTransaction((tx) => updateUnion(tx, testerId, u.id, {
      end_reason: 'separation', end_date: '1990-01-01', end_date_precision: 'year',
    }));
    assert.equal(ed.end_reason, 'separation');
    await withTransaction((tx) => deleteUnion(tx, testerId, u.id));
    assert.equal(await logCount(u.id, 'delete'), 1);
    await assert.rejects(withTransaction((tx) => createUnion(tx, testerId, {
      person_a_id: teresa, person_b_id: teresa,
    })), /consigo misma/);
    await assert.rejects(withTransaction((tx) => createUnion(tx, testerId, {
      person_a_id: teresa, person_b_id: luis, kind: 'noviazgo',
    })), /Tipo de unión/);
  });
});

describe('Fase 3: duplicados', () => {
  it('detecta a Carmen con falta de ortografía y fecha', async () => {
    const found = await findDuplicates(db, {
      given_names: 'Karmen', paternal_surname: 'Garsia',
      birth_date: '1912-09-03',
    });
    const carmen = found.find((f) => f.person.given_names === 'Carmen'
      && f.person.paternal_surname === 'García' && f.person.maternal_surname === 'Martínez');
    assert.ok(carmen, 'encuentra a Carmen García Martínez');
    assert.ok(carmen.score >= 0.4, `puntaje ${carmen.score}`);
    assert.ok(carmen.reasons.some((r) => /nacimiento/.test(r)));
  });

  it('padres en común suben el puntaje y exclude_id filtra', async () => {
    const carmenId = await demoId('Carmen', 'García', 'Martínez', 1912);
    const antonio = await demoId('Antonio', 'Torres', 'Ruiz', 1910);
    const base = {
      given_names: 'Teresa', paternal_surname: 'Torres', maternal_surname: 'García',
      parent_ids: [carmenId, antonio],
    };
    const withParents = await findDuplicates(db, base);
    const teresas = withParents.filter((f) => f.person.given_names === 'Teresa'
      && f.person.paternal_surname === 'Torres' && f.person.maternal_surname === 'García');
    assert.ok(teresas.length > 0, 'encuentra Teresas Torres García');
    const teresa = teresas.find((f) => f.reasons.some((r) => /común/.test(r))) ?? teresas[0];
    assert.ok(teresa.reasons.some((r) => /común/.test(r)), JSON.stringify(teresa.reasons));
    const excluded = await findDuplicates(db, { ...base, exclude_id: teresa.person.id });
    assert.ok(!excluded.some((f) => f.person.id === teresa.person.id));
  });
});

describe('Fase 3b: coherencia cronológica', () => {
  async function mk(name, birth) {
    const p = await withTransaction((tx) => createPerson(tx, testerId, {
      given_names: name, paternal_surname: 'Cronos', birth_date: birth, birth_date_precision: 'day',
    }));
    trashPersons.push(p.id);
    return p.id;
  }

  it('hijo no nace antes que su padre/madre (biológico y adoptivo)', async () => {
    const viejo = await mk('Viejo', '1980-01-01');
    const joven = await mk('Joven', '2000-01-01');
    // Inválido: el supuesto hijo (1980) nació antes que el supuesto padre (2000).
    await assert.rejects(withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: joven, child_id: viejo, kind: 'biological',
    })), /antes/);
    await assert.rejects(withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: joven, child_id: viejo, kind: 'adoptive',
    })), /antes/);
    // Hijastro o crianza sí permite (vínculo social).
    const step = await withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: joven, child_id: viejo, kind: 'step',
    }));
    trashLinks.push(step.id);
    // Orden correcto sí pasa.
    const nieto = await mk('Nieto', '2020-01-01');
    const ok = await withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: joven, child_id: nieto, kind: 'biological',
    }));
    trashLinks.push(ok.id);
  });

  it('la unión no empieza antes de nacer ni termina antes de empezar', async () => {
    const a = await mk('Novio', '1990-06-01');
    const b = await mk('Novia', '1992-06-01');
    await assert.rejects(withTransaction((tx) => createUnion(tx, testerId, {
      person_a_id: a, person_b_id: b, kind: 'marriage', start_date: '1985-01-01',
    })), /antes de que naciera/);
    const u = await withTransaction((tx) => createUnion(tx, testerId, {
      person_a_id: a, person_b_id: b, kind: 'marriage', start_date: '2010-01-01',
    }));
    trashUnions.push(u.id);
    await assert.rejects(withTransaction((tx) => updateUnion(tx, testerId, u.id, {
      end_date: '2005-01-01',
    })), /antes de empezar/);
  });

  it('cambiar un nacimiento respeta a padres, hijos y uniones', async () => {
    const padre = await mk('PadreV', '1970-01-01');
    const hija = await mk('HijaV', '1995-01-01');
    const link = await withTransaction((tx) => addParentLink(tx, testerId, {
      parent_id: padre, child_id: hija,
    }));
    trashLinks.push(link.id);
    // Hija antes que el padre: no.
    await assert.rejects(withTransaction((tx) => updatePerson(tx, testerId, hija, {
      birth_date: '1960-01-01',
    })), /antes/);
    // Padre después que la hija: no.
    await assert.rejects(withTransaction((tx) => updatePerson(tx, testerId, padre, {
      birth_date: '2000-01-01',
    })), /antes/);
    // Cambio coherente: sí.
    const ok = await withTransaction((tx) => updatePerson(tx, testerId, hija, {
      birth_date: '1996-05-05',
    }));
    assert.equal(String(ok.birth_date).slice(0, 10), '1996-05-05');
  });
});
