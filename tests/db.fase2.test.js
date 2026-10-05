// Pruebas Fase 2: invitaciones, vinculación, límite de intentos y adapter.
// Uso: npm run test:db
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { createInvite, validateInvite, redeemInvite, listInvites } from '../src/lib/auth/invites.js';
import { prepareMagicLink, checkRateLimit, requestMagicLink } from '../src/lib/auth/magic.js';
import { authorizeMagicToken } from '../src/lib/auth/magic-token.js';
import { PgAdapter } from '../src/lib/auth/adapter.js';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const adapter = PgAdapter();
const T = (s) => `fase2-${s}-${Date.now()}`;

let adminId, memberId, teresaId;

before(async () => {
  await db.connect();
  // Persona propia del test (no depende del seed: la DB puede tener datos reales).
  const tp = await db.query(
    "INSERT INTO persons (given_names, paternal_surname) VALUES ('Test','FaseDos') RETURNING id");
  teresaId = tp.rows[0].id;
  const a = await db.query(
    "INSERT INTO users (email, name, role) VALUES ($1,'Admin Test','admin') RETURNING id", [T('admin') + '@test.local']);
  adminId = a.rows[0].id;
  const m = await db.query(
    "INSERT INTO users (email, name, role) VALUES ($1,'Member Test','member') RETURNING id", [T('member') + '@test.local']);
  memberId = m.rows[0].id;
});

after(async () => {
  await db.query('DELETE FROM magic_link_attempts WHERE email LIKE $1', ['fase2-%@test.local']);
  await db.query('DELETE FROM verification_tokens WHERE identifier LIKE $1', ['fase2-%@test.local']);
  await db.query('DELETE FROM invites WHERE invited_by IN ($1,$2)', [adminId, memberId]);
  await db.query('DELETE FROM accounts WHERE user_id IN ($1,$2)', [adminId, memberId]);
  await db.query('DELETE FROM users WHERE id IN ($1,$2)', [adminId, memberId]);
  await db.query('DELETE FROM users WHERE email LIKE $1', ['fase2-%@test.local']);
  await db.query('DELETE FROM change_log WHERE entity_id=$1', [teresaId]);
  await db.query('DELETE FROM persons WHERE id=$1', [teresaId]);
  await db.end();
});

describe('Fase 2: invitaciones', () => {
  it('crea, valida y canjea (vincula persona + un solo uso)', async () => {
    const inv = await createInvite({ invitedBy: adminId, targetPersonId: teresaId, expiresInDays: 7 });
    assert.ok(inv.code.length >= 10);
    const v = await validateInvite(inv.code);
    assert.equal(v.ok, true);
    const guest = await db.query(
      "INSERT INTO users (email, name, role) VALUES ($1,'Invitado','member') RETURNING id", [T('guest') + '@test.local']);
    const r = await redeemInvite({ userId: guest.rows[0].id, code: inv.code });
    assert.equal(r.personId, teresaId);
    const me = await db.query('SELECT person_id FROM users WHERE id=$1', [guest.rows[0].id]);
    assert.equal(me.rows[0].person_id, teresaId);
    const v2 = await validateInvite(inv.code);
    assert.equal(v2.ok, false);
    assert.match(v2.reason, /usada/);
  });

  it('rechaza código inexistente y vencido', async () => {
    const bad = await validateInvite('no-existe-123');
    assert.equal(bad.ok, false);
    const exp = await createInvite({ invitedBy: adminId, expiresInDays: -1 });
    const v = await validateInvite(exp.code);
    assert.equal(v.ok, false);
    assert.match(v.reason, /venció/);
  });

  it('lista invitaciones', async () => {
    await createInvite({ invitedBy: adminId });
    const list = await listInvites();
    assert.ok(list.length >= 1);
  });
});

describe('Fase 2: límite de intentos', () => {
  it('permite 5 y bloquea el 6°', async () => {
    const email = T('rate') + '@test.local';
    await db.query('INSERT INTO users (email, name, role) VALUES ($1,$2,$3)', [email, 'Rate', 'member']);
    for (let i = 0; i < 5; i++) {
      const r = await prepareMagicLink(email);
      assert.equal(r.ok, true, `intento ${i + 1}`);
    }
    const blocked = await prepareMagicLink(email);
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /Demasiados intentos/);
    assert.equal(await checkRateLimit(email), false);
  });

  it('correo nuevo sin invitación es rechazado', async () => {
    const r = await prepareMagicLink(T('nuevo') + '@test.local', null);
    assert.equal(r.ok, false);
    assert.match(r.error, /invitación/);
  });

  it('correo nuevo con invitación válida pasa', async () => {
    const inv = await createInvite({ invitedBy: adminId });
    const r = await prepareMagicLink(T('nuevo2') + '@test.local', inv.code);
    assert.equal(r.ok, true);
  });
});

describe('Fase 2: adapter', () => {
  it('ciclo usuario + token de verificación de un solo uso', async () => {
    const email = T('adapter') + '@test.local';
    const u = await adapter.createUser({ email, name: 'Adapter', emailVerified: null });
    assert.equal(u.role, 'member');
    const found = await adapter.getUserByEmail(email.toUpperCase());
    assert.equal(found.id, u.id);
    const tok = await adapter.createVerificationToken({
      identifier: email, token: T('tok'), expires: new Date(Date.now() + 600000),
    });
    assert.equal(tok.token.length > 0, true);
    const used = await adapter.useVerificationToken({ identifier: email, token: tok.token });
    assert.equal(used.token, tok.token);
    const reuse = await adapter.useVerificationToken({ identifier: email, token: tok.token });
    assert.equal(reuse, null);
    await db.query('DELETE FROM users WHERE id=$1', [u.id]);
  });

  it('rol inválido es rechazado', async () => {
    await assert.rejects(db.query(
      "INSERT INTO users (email, role) VALUES ($1,'superadmin')", [T('rol') + '@test.local']));
  });
});

describe('Flujo con confirmación (anti-prefetch)', () => {
  it('token de un solo uso: autoriza una vez y la segunda falla', async () => {
    const inv = await createInvite({ invitedBy: adminId });
    const email = T('confirm') + '@test.local';
    // Sin enviar correo de verdad: validamos y creamos el token directo.
    const prep = await prepareMagicLink(email, inv.code);
    assert.equal(prep.ok, true);
    const { rows: [{ token }] } = await db.query(
      `INSERT INTO verification_tokens (identifier, token, expires)
       VALUES ($1, $2, now() + interval '60 minutes') RETURNING token`,
      [email, crypto.randomBytes(32).toString('hex')]);
    const first = await authorizeMagicToken(token);
    assert.ok(first?.id, 'primera confirmación crea sesión');
    assert.equal(first.email, email);
    const second = await authorizeMagicToken(token);
    assert.equal(second, null, 'el mismo token no sirve dos veces');
    const bad = await authorizeMagicToken('00'.repeat(32));
    assert.equal(bad, null, 'token inexistente falla');
  });

  it('requestMagicLink envía con stub de correo', async () => {
    // requestMagicLink llama sendMagicLink; con MAIL_DRIVER=console no envía.
    const inv = await createInvite({ invitedBy: adminId });
    const email = T('req') + '@test.local';
    const prev = process.env.MAIL_DRIVER;
    process.env.MAIL_DRIVER = 'console';
    try {
      const r = await requestMagicLink(email, inv.code);
      assert.equal(r.ok, true);
      const { rows } = await db.query('SELECT token FROM verification_tokens WHERE identifier=$1', [email]);
      assert.equal(rows.length, 1, 'token guardado');
      await db.query('DELETE FROM verification_tokens WHERE identifier=$1', [email]);
    } finally {
      if (prev === undefined) delete process.env.MAIL_DRIVER;
      else process.env.MAIL_DRIVER = prev;
    }
  });
});
