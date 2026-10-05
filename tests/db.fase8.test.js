// Pruebas Fase 8: fusión+deshacer, historial, candidatos y huecos.
// Uso: npm run test:db
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { withTransaction } from '../src/lib/db/client.js';
import { listChanges, canUndo, undoChange, mergePersons } from '../src/lib/db/history.js';
import { scanDuplicateCandidates, listPendingCandidates, dismissCandidate } from '../src/lib/db/duplicates.js';
import { createFact, deleteFact } from '../src/lib/db/content.js';
import { computeGaps } from '../src/lib/tree-layout/index.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = { query: (t, p) => pool.query(t, p) };
const T = (s) => `fase8-${s}-${Date.now()}`;

let admin, member;
const trash = { persons: [], users: [], invites: [], branches: [], stories: [], facts: [] };

async function mkPerson(name) {
  const { rows: [p] } = await pool.query(
    "INSERT INTO persons (given_names, paternal_surname) VALUES ($1,'Fusion') RETURNING id", [name]);
  trash.persons.push(p.id);
  return p.id;
}

before(async () => {
  const a = await pool.query("INSERT INTO users (email, name, role) VALUES ($1,'A8 Admin','admin') RETURNING *", [T('a') + '@test.local']);
  const m = await pool.query("INSERT INTO users (email, name, role) VALUES ($1,'A8 Member','member') RETURNING *", [T('m') + '@test.local']);
  admin = a.rows[0];
  member = m.rows[0];
  trash.users.push(admin.id, member.id);
});

after(async () => {
  await pool.query('DELETE FROM merge_candidates');
  await pool.query('DELETE FROM story_mentions WHERE story_id = ANY($1)', [trash.stories]);
  await pool.query('DELETE FROM stories WHERE id = ANY($1)', [trash.stories]);
  await pool.query('DELETE FROM facts WHERE id = ANY($1)', [trash.facts]);
  await pool.query('DELETE FROM parent_links WHERE parent_id = ANY($1) OR child_id = ANY($1)', [trash.persons]);
  await pool.query('DELETE FROM unions WHERE person_a_id = ANY($1) OR person_b_id = ANY($1)', [trash.persons]);
  await pool.query('DELETE FROM invites WHERE id = ANY($1)', [trash.invites]);
  await pool.query('DELETE FROM branches WHERE id = ANY($1)', [trash.branches]);
  await pool.query('DELETE FROM change_log WHERE user_id = ANY($1)', [trash.users]);
  await pool.query('DELETE FROM persons WHERE id = ANY($1)', [trash.persons]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [trash.users]);
  await pool.end();
});

describe('Fase 8: fusión y deshacer', () => {
  it('fusiona referencias, oculta duplicado y revierte todo', async () => {
    const P1 = await mkPerson('PadreUno');
    const P2 = await mkPerson('PadreDos');
    const KEEP = await mkPerson('Conservada');
    const DROP = await mkPerson('Duplicada');
    const C1 = await mkPerson('HijaComun');
    const C2 = await mkPerson('HijaDrop');
    const TI = await mkPerson('Tercera');
    await pool.query('INSERT INTO parent_links (parent_id, child_id) VALUES ($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)',
      [P1, KEEP, P2, DROP, KEEP, C1, DROP, C1, DROP, C2]);
    const un = await pool.query(
      "INSERT INTO unions (person_a_id, person_b_id, kind) VALUES ($1,$2,'marriage') RETURNING id", [DROP, TI]);
    const st = await pool.query('INSERT INTO stories (person_id, author_user_id, body) VALUES ($1,$2,$3) RETURNING id',
      [DROP, admin.id, 'Historia del duplicado']);
    trash.stories.push(st.rows[0].id);
    const fc = await pool.query("INSERT INTO facts (person_id, type, value) VALUES ($1,'other','Dato dup') RETURNING id", [DROP]);
    trash.facts.push(fc.rows[0].id);
    await pool.query('UPDATE users SET person_id=$1 WHERE id=$2', [DROP, member.id]);
    const iv = await pool.query('INSERT INTO invites (code, invited_by, target_person_id) VALUES ($1,$2,$3) RETURNING id',
      [T('c'), admin.id, DROP]);
    trash.invites.push(iv.rows[0].id);
    const br = await pool.query("INSERT INTO branches (name, color, founder_person_id) VALUES ($1,'#123456',$2) RETURNING id",
      [T('Rama'), DROP]);
    trash.branches.push(br.rows[0].id);
    await pool.query('INSERT INTO merge_candidates (person_a_id, person_b_id, score) VALUES ($1,$2,0.9)', [KEEP, DROP]);

    const r = await withTransaction((tx) => mergePersons(tx, admin.id, KEEP, DROP));
    assert.equal(r.kept, KEEP);

    const parents = async (id) => (await pool.query(
      'SELECT parent_id FROM parent_links WHERE child_id=$1 AND deleted_at IS NULL', [id])).rows.map((x) => x.parent_id);
    assert.deepEqual((await parents(C2)).sort(), [KEEP], 'hija de drop ahora es de keep');
    assert.deepEqual((await parents(C1)).sort(), [KEEP], 'hija común sin duplicar vínculo');
    const uu = await pool.query('SELECT person_a_id, person_b_id FROM unions WHERE id=$1', [un.rows[0].id]);
    assert.ok([uu.rows[0].person_a_id, uu.rows[0].person_b_id].includes(KEEP), 'unión movida a keep');
    assert.ok(![uu.rows[0].person_a_id, uu.rows[0].person_b_id].includes(DROP));
    assert.equal((await pool.query('SELECT person_id FROM stories WHERE id=$1', [st.rows[0].id])).rows[0].person_id, KEEP);
    assert.equal((await pool.query('SELECT person_id FROM users WHERE id=$1', [member.id])).rows[0].person_id, KEEP);
    assert.equal((await pool.query('SELECT target_person_id FROM invites WHERE id=$1', [iv.rows[0].id])).rows[0].target_person_id, KEEP);
    assert.equal((await pool.query('SELECT founder_person_id FROM branches WHERE id=$1', [br.rows[0].id])).rows[0].founder_person_id, KEEP);
    assert.ok((await pool.query('SELECT deleted_at FROM persons WHERE id=$1', [DROP])).rows[0].deleted_at, 'drop oculto');
    assert.equal((await pool.query("SELECT status FROM merge_candidates WHERE person_a_id=$1 AND person_b_id=$2", [KEEP, DROP])).rows[0].status, 'merged');
    const log = await pool.query("SELECT id FROM change_log WHERE entity_id=$1 AND action='merge'", [KEEP]);
    assert.ok(log.rows[0], 'fusión registrada');

    // Deshacer la fusión.
    await withTransaction((tx) => undoChange(tx, admin, log.rows[0].id));
    assert.deepEqual((await parents(C2)).sort(), [DROP], 'hija vuelve a drop');
    assert.deepEqual((await parents(C1)).sort(), [DROP, KEEP].sort(), 'vínculo duplicado restaurado');
    const uu2 = await pool.query('SELECT person_a_id FROM unions WHERE id=$1', [un.rows[0].id]);
    assert.equal(uu2.rows[0].person_a_id, DROP);
    assert.equal((await pool.query('SELECT person_id FROM stories WHERE id=$1', [st.rows[0].id])).rows[0].person_id, DROP);
    assert.equal((await pool.query('SELECT deleted_at FROM persons WHERE id=$1', [DROP])).rows[0].deleted_at, null, 'drop visible');
    assert.equal((await pool.query("SELECT status FROM merge_candidates WHERE person_a_id=$1 AND person_b_id=$2", [KEEP, DROP])).rows[0].status, 'pending');
  });

  it('deshace crear/editar/borrar y respeta permisos', async () => {
    const f = await withTransaction(async (tx) => createFact(tx, member.id, (await mkPerson('HijaHecho')), {
      type: 'other', value: 'uno', certainty: 'confirmed',
    }));
    trash.facts.push(f.id);
    const adminEntry = { id: 'x', user_id: admin.id, role: undefined };
    assert.equal(canUndo({ user_id: member.id }, member), true);
    assert.equal(canUndo({ user_id: member.id }, { id: 'otro', role: 'member' }), false);
    assert.equal(canUndo({ user_id: member.id }, admin), true);
    // Member deshace lo suyo (delete del hecho que creó admin? no: crea uno propio).
    const mine = await withTransaction(async (tx) => createFact(tx, member.id, (await mkPerson('Otra')), {
      type: 'other', value: 'mio',
    }));
    trash.facts.push(mine.id);
    const lg = await pool.query("SELECT id FROM change_log WHERE entity_id=$1 AND action='create'", [mine.id]);
    await withTransaction((tx) => undoChange(tx, member, lg.rows[0].id));
    assert.ok((await pool.query('SELECT deleted_at FROM facts WHERE id=$1', [mine.id])).rows[0].deleted_at, 'creación deshecha = oculto');
    // Otro miembro no puede deshacer lo ajeno.
    const other = await pool.query("INSERT INTO users (email, role) VALUES ($1,'member') RETURNING *", [T('o') + '@test.local']);
    trash.users.push(other.rows[0].id);
    await assert.rejects(
      withTransaction((tx) => undoChange(tx, other.rows[0], lg.rows[0].id)), /propios/);
    await pool.query('DELETE FROM users WHERE id=$1', [other.rows[0].id]);
    // Borrar se restaura.
    await withTransaction((tx) => deleteFact(tx, admin.id, f.id));
    const del = await pool.query("SELECT id FROM change_log WHERE entity_id=$1 AND action='delete' ORDER BY created_at DESC LIMIT 1", [f.id]);
    await withTransaction((tx) => undoChange(tx, admin, del.rows[0].id));
    assert.equal((await pool.query('SELECT deleted_at FROM facts WHERE id=$1', [f.id])).rows[0].deleted_at, null);
  });
});

describe('Fase 8: candidatos e historial', () => {
  it('rastrea candidatos y descarta', async () => {
    await pool.query('DELETE FROM merge_candidates');
    const before = await listPendingCandidates(db);
    assert.equal(before.length, 0, 'empieza vacío');
    const r = await scanDuplicateCandidates(db, { threshold: 0.7, limit: 100 });
    assert.ok(r.scanned >= 0 && r.inserted >= 0);
    const after = await listPendingCandidates(db);
    assert.ok(after.length > 0, 'encuentra candidatos en 2058 personas');
    assert.ok(after[0].score >= 0.5 && after[0].a && after[0].b);
    await dismissCandidate(db, admin.id, after[0].id);
    const left = await listPendingCandidates(db);
    assert.equal(left.length, after.length - 1);
  });

  it('lista historial con actor', async () => {
    const rows = await listChanges(db, { limit: 5 });
    assert.ok(rows.length > 0);
    assert.ok('actor_name' in rows[0] && 'action' in rows[0]);
  });
});

describe('Fase 8: huecos puros', () => {
  it('personas con 0 o 1 padre (fundadores incluidos)', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const links = [
      { parent_id: 'a', child_id: 'b' },
      { parent_id: 'a', child_id: 'c' },
      { parent_id: 'x', child_id: 'c' },
    ];
    const gaps = computeGaps(nodes, links);
    assert.deepEqual(gaps, [
      { forPersonId: 'a', missing: 2 },
      { forPersonId: 'b', missing: 1 },
      { forPersonId: 'd', missing: 2 },
    ], 'a y d sin padres; b con 1; c completa no aparece');
  });
});
