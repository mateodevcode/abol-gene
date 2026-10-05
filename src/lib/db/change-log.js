/**
 * Historial de cambios: cada escritura de la app registra aquí DENTRO de la
 * misma transacción (el `db` es el cliente transaccional de withTransaction).
 */

/**
 * @param {{ query: Function }} db cliente pg (pool o transaccional)
 * @param {{ entity_type: string, entity_id: string, action: 'create'|'update'|'delete'|'merge'|'restore', before?: any, after?: any, user_id?: string|null }} change
 */
export async function logChange(db, { entity_type, entity_id, action, before = null, after = null, user_id = null }) {
  await db.query(
    `INSERT INTO change_log (entity_type, entity_id, action, before, after, user_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [entity_type, entity_id, action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      user_id]);
}
