import { Pool, types } from 'pg';

// Las columnas DATE son días de calendario sin zona horaria. Sin esto, `pg`
// las devuelve como Date a medianoche local y cualquier getter UTC (o el
// JSON) puede mover el día. Como texto 'YYYY-MM-DD' no hay ambigüedad.
types.setTypeParser(1082, (v) => v);

/**
 * Pool singleton de PostgreSQL.
 * El navegador nunca habla directo con la DB; solo Route Handlers / Server Actions usan esto.
 * @type {import('pg').Pool | null}
 */
let pool = null;

/**
 * Devuelve el pool compartido. Lee DATABASE_URL del entorno (.env.local en local).
 * @returns {import('pg').Pool}
 */
export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta DATABASE_URL en el entorno (.env.local). Ver README.');
  }
  pool = new Pool({
    connectionString,
    // Vercel + Postgres: funciones cortas, pool pequeño por instancia (ver Fase 9).
    max: Number(process.env.PG_POOL_MAX ?? 5),
  });
  return pool;
}

/**
 * Ejecuta una consulta con el pool compartido.
 * @param {string} text SQL
 * @param {any[]} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
export function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Ejecuta `fn` dentro de una transacción (COMMIT/ROLLBACK automáticos).
 * Cada escritura de la app registra su change_log DENTRO de la misma
 * transacción usando el cliente que recibe `fn`.
 * @param {(db: import('pg').PoolClient) => Promise<any>} fn
 */
export async function withTransaction(fn) {
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (e) {
    try { await db.query('ROLLBACK'); } catch { /* ya falló */ }
    throw e;
  } finally {
    db.release();
  }
}
