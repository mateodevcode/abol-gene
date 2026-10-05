import crypto from 'node:crypto';
import { query } from '@/lib/db/client';

/** ¿Quién puede invitar? Por defecto solo admin (configurable). */
export const INVITE_ROLE = process.env.INVITE_ROLE ?? 'admin';

export function canInvite(role) {
  if (INVITE_ROLE === 'member') return role === 'member' || role === 'admin';
  return role === 'admin';
}

/**
 * Crea una invitación de un solo uso.
 * @param {{ invitedBy: string, targetPersonId?: string|null, expiresInDays?: number }} args
 */
export async function createInvite({ invitedBy, targetPersonId = null, expiresInDays = 30 }) {
  const code = crypto.randomBytes(9).toString('base64url');
  const { rows: [row] } = await query(
    `INSERT INTO invites (code, invited_by, target_person_id, expires_at)
     VALUES ($1,$2,$3, now() + ($4 || ' days')::interval) RETURNING *`,
    [code, invitedBy, targetPersonId, String(expiresInDays)]);
  return row;
}

/** Lista invitaciones con estado (solo quien puede invitar). */
export async function listInvites() {
  const { rows } = await query(
    `SELECT i.*, u.name AS inviter_name, u.email AS inviter_email,
       p.given_names || ' ' || COALESCE(p.paternal_surname,'') AS target_name
     FROM invites i
     LEFT JOIN users u ON u.id = i.invited_by
     LEFT JOIN persons p ON p.id = i.target_person_id
     WHERE i.deleted_at IS NULL ORDER BY i.created_at DESC LIMIT 100`);
  return rows;
}

/** Invitación pública por código (para mostrar en /join: nombre del invitador). */
export async function getInvitePreview(code) {
  const { rows: [row] } = await query(
    `SELECT i.code, i.expires_at, i.used_at, u.name AS inviter_name,
       p.given_names || ' ' || COALESCE(p.paternal_surname,'') AS target_name
     FROM invites i LEFT JOIN users u ON u.id = i.invited_by
     LEFT JOIN persons p ON p.id = i.target_person_id
     WHERE i.code=$1 AND i.deleted_at IS NULL`, [code]);
  return row ?? null;
}

/**
 * Valida un código: existe, no usado, no vencido, no borrado.
 * @returns {Promise<{ ok: boolean, reason?: string, invite?: any }>}
 */
export async function validateInvite(code) {
  if (!code) return { ok: false, reason: 'Falta el código de invitación.' };
  const { rows: [row] } = await query(
    'SELECT * FROM invites WHERE code=$1 AND deleted_at IS NULL', [code]);
  if (!row) return { ok: false, reason: 'Invitación no válida.' };
  if (row.used_at) return { ok: false, reason: 'Esta invitación ya fue usada.' };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { ok: false, reason: 'Esta invitación venció.' };
  }
  return { ok: true, invite: row };
}

/**
 * Vincula un usuario con su persona y marca la invitación como usada,
 * en una sola transacción.
 */
export async function redeemInvite({ userId, code, personId = null }) {
  const v = await validateInvite(code);
  if (!v.ok) throw new Error(v.reason);
  const targetPerson = personId ?? v.invite.target_person_id;
  if (!targetPerson) throw new Error('Elige tu persona en el árbol.');
  const target = await query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [targetPerson]);
  if (!target.rows[0]) throw new Error('Persona no encontrada.');
  await query('BEGIN');
  try {
    await query('UPDATE users SET person_id=$1 WHERE id=$2 AND person_id IS NULL', [targetPerson, userId]);
    await query(
      `UPDATE invites SET used_by=$1, used_at=now()
        WHERE code=$2 AND used_at IS NULL`, [userId, code]);
    await query(
      `INSERT INTO change_log (entity_type, entity_id, action, after, user_id)
       VALUES ('invite', $1, 'update', $2, $3)`,
      [v.invite.id, JSON.stringify({ code, linked_person: targetPerson }), userId]);
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }
  return { personId: targetPerson };
}

/** Vinculación directa "soy esta persona" (con invitación válida ya verificada). */
export async function linkOwnPerson({ userId, personId }) {
  const target = await query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [personId]);
  if (!target.rows[0]) throw new Error('Persona no encontrada.');
  const { rows: [row] } = await query(
    'UPDATE users SET person_id=$1 WHERE id=$2 AND person_id IS NULL RETURNING person_id',
    [personId, userId]);
  if (!row) throw new Error('Tu cuenta ya está vinculada a una persona.');
  return row;
}
