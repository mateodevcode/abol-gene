import { PgAdapter } from '@/lib/auth/adapter';
import { query } from '@/lib/db/client';

/** Minutos de vida del enlace (el temporizador real corre al confirmar). */
export const MAGIC_TOKEN_MAX_AGE_MIN = 60;

const adapter = PgAdapter();

/**
 * Canjea un token mágico de un solo uso (lo borra al leer).
 * Lo usa el proveedor `magic-token` de Auth.js y las pruebas.
 * @param {string} token hexadecimal de 64
 * @returns {Promise<{ id: string, name: string|null, email: string }|null>}
 */
export async function authorizeMagicToken(token) {
  const clean = String(token ?? '').trim();
  if (!/^[a-f0-9]{64}$/.test(clean)) return null;
  const { rows: [t] } = await query(
    'SELECT identifier, expires FROM verification_tokens WHERE token=$1', [clean]);
  if (!t) return null;
  const used = await adapter.useVerificationToken({ identifier: t.identifier, token: clean });
  if (!used || new Date(used.expires) < new Date()) return null;
  let user = await adapter.getUserByEmail(t.identifier);
  if (!user) {
    user = await adapter.createUser({ email: t.identifier });
  }
  await query('UPDATE users SET email_verified=COALESCE(email_verified, now()) WHERE id=$1', [user.id]);
  return { id: user.id, name: user.name, email: user.email };
}
