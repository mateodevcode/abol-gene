import { query } from '@/lib/db/client';

/**
 * Adapter NextAuth v4 sobre nuestras tablas (`users` de la app + `accounts`,
 * `verification_tokens`). Sesiones JWT: no se usa tabla de sesiones.
 */

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified,
    image: row.image ?? null,
    role: row.role,
    person_id: row.person_id,
  };
}

/** @type {import('next-auth/adapters').Adapter} */
export function PgAdapter() {
  return {
    async createUser(data) {
      const { rows: [row] } = await query(
        `INSERT INTO users (email, name, email_verified, image, role)
         VALUES ($1, $2, $3, $4, 'member') RETURNING *`,
        [data.email, data.name ?? null, data.emailVerified ?? null, data.image ?? null]);
      return toUser(row);
    },
    async getUser(id) {
      const { rows: [row] } = await query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
      return toUser(row);
    },
    async getUserByEmail(email) {
      const { rows: [row] } = await query(
        'SELECT * FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL', [email]);
      return toUser(row);
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const { rows: [row] } = await query(
        `SELECT u.* FROM users u JOIN accounts a ON a.user_id = u.id
          WHERE a.provider=$1 AND a.provider_account_id=$2 AND u.deleted_at IS NULL`,
        [provider, providerAccountId]);
      return toUser(row);
    },
    async updateUser(data) {
      const { rows: [row] } = await query(
        `UPDATE users SET name=COALESCE($2,name), email=COALESCE($3,email),
           email_verified=COALESCE($4,email_verified), image=COALESCE($5,image)
         WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
        [data.id, data.name ?? null, data.email ?? null, data.emailVerified ?? null, data.image ?? null]);
      return toUser(row);
    },
    async deleteUser(id) {
      await query('UPDATE users SET deleted_at=now() WHERE id=$1', [id]); // borrado lógico
    },
    async linkAccount(data) {
      await query(
        `INSERT INTO accounts (user_id, type, provider, provider_account_id, refresh_token,
           access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (provider, provider_account_id) DO NOTHING`,
        [data.userId, data.type, data.provider, data.providerAccountId,
          data.refresh_token ?? null, data.access_token ?? null, data.expires_at ?? null,
          data.token_type ?? null, data.scope ?? null, data.id_token ?? null,
          data.session_state ?? null]);
    },
    async createSession() { throw new Error('Sesiones JWT: sin tabla de sesiones.'); },
    async getSessionAndUser() { throw new Error('Sesiones JWT: sin tabla de sesiones.'); },
    async updateSession() { throw new Error('Sesiones JWT: sin tabla de sesiones.'); },
    async deleteSession() { /* sin tabla */ },
    async createVerificationToken(data) {
      await query(
        'INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1,$2,$3)',
        [data.identifier, data.token, data.expires]);
      return data;
    },
    async useVerificationToken({ identifier, token }) {
      const { rows: [row] } = await query(
        `DELETE FROM verification_tokens WHERE identifier=$1 AND token=$2 RETURNING *`,
        [identifier, token]);
      if (!row) return null;
      return { identifier: row.identifier, token: row.token, expires: row.expires };
    },
  };
}
