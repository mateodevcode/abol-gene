'use server';

import crypto from 'node:crypto';
import { query } from '@/lib/db/client';
import { validateInvite } from '@/lib/auth/invites';
import { MAGIC_LINK_LIMIT, MAGIC_LINK_WINDOW_MS, sendMagicLink } from '@/lib/mailer/index.js';
import { MAGIC_TOKEN_MAX_AGE_MIN } from '@/lib/auth/magic-token';

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Valida y registra un pedido de enlace mágico. Solo invitados: si el correo
 * no tiene cuenta, exige un código válido. El cliente llama después a
 * signIn('email') de next-auth/react. Guarda el código para canjearlo en
 * /bienvenida y aplica el límite de intentos.
 */
export async function prepareMagicLink(email, inviteCode = null) {
  const clean = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, error: 'Correo no válido.' };
  }
  const existing = await query('SELECT id FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL', [clean]);
  let code = inviteCode ? String(inviteCode).trim() : null;
  if (!existing.rows[0]) {
    const v = await validateInvite(code);
    if (!v.ok) return { ok: false, error: v.reason ?? 'Necesitas una invitación válida para entrar.' };
    code = v.invite.code;
  }

  // Límite: N por hora y correo.
  const { rows: [row] } = await query('SELECT * FROM magic_link_attempts WHERE email=$1', [clean]);
  const now = Date.now();
  if (row && now - new Date(row.window_start).getTime() < MAGIC_LINK_WINDOW_MS && row.count >= MAGIC_LINK_LIMIT) {
    return { ok: false, error: 'Demasiados intentos. Espera una hora e inténtalo de nuevo.' };
  }
  if (!row || now - new Date(row.window_start).getTime() >= MAGIC_LINK_WINDOW_MS) {
    await query(
      `INSERT INTO magic_link_attempts (email, count, window_start, invite_code, updated_at)
       VALUES ($1, 1, now(), $2, now())
       ON CONFLICT (email) DO UPDATE SET count=1, window_start=now(), invite_code=$2, updated_at=now()`,
      [clean, code]);
  } else {
    await query(
      'UPDATE magic_link_attempts SET count=count+1, invite_code=COALESCE($2, invite_code), updated_at=now() WHERE email=$1',
      [clean, code]);
  }
  return { ok: true, email: clean };
}

/** Invitación pendiente ligada al correo (para /bienvenida). */
export async function pendingInviteFor(email) {
  const clean = normalizeEmail(email);
  const { rows: [row] } = await query('SELECT invite_code FROM magic_link_attempts WHERE email=$1', [clean]);
  return row?.invite_code ?? null;
}

/**
 * Flujo completo: valida invitación + límite, crea token de un solo uso y
 * envía el correo con el enlace a /verificar. Abrir el correo NO gasta nada;
 * solo el botón "Entrar" (POST) consume el token. Inmune a prefetch.
 */
export async function requestMagicLink(email, inviteCode = null) {
  const prep = await prepareMagicLink(email, inviteCode);
  if (!prep.ok) return prep;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + MAGIC_TOKEN_MAX_AGE_MIN * 60 * 1000);
  await query(
    'INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1,$2,$3)',
    [prep.email, token, expires]);
  const base = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  try {
    await sendMagicLink({ to: prep.email, url: `${base}/verificar?token=${token}` });
  } catch (e) {
    await query('DELETE FROM verification_tokens WHERE identifier=$1 AND token=$2', [prep.email, token]);
    return { ok: false, error: 'No se pudo enviar el correo. Inténtalo de nuevo.' };
  }
  return { ok: true };
}

/** Límite de intentos (lo usa también sendVerificationRequest como respaldo). */
export async function checkRateLimit(email) {
  const clean = normalizeEmail(email);
  const { rows: [row] } = await query('SELECT * FROM magic_link_attempts WHERE email=$1', [clean]);
  if (!row) return true;
  if (Date.now() - new Date(row.window_start).getTime() >= MAGIC_LINK_WINDOW_MS) return true;
  return row.count < MAGIC_LINK_LIMIT;
}
