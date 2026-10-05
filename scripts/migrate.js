// Script: aplica migraciones SQL versionadas de /db/migrations en orden.
// Uso: npm run db:migrate
// Fase 1 agregará las migraciones reales del modelo. Este runner ya queda listo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Cópialo en .env.local (ver .env.example y README).');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

const files = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith('.sql'))
  .map((d) => d.name)
  .sort();

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const applied = new Set(
    (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
  );
  if (files.length === 0) {
    console.log('Sin migraciones pendientes (db/migrations vacío; se llena en Fase 1).');
  }
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`= ${f} (ya aplicada)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    console.log(`> aplicando ${f}...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`OK ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
} catch (e) {
  console.error('MIGRATE_ERROR:', e.message?.slice(0, 300));
  process.exit(1);
} finally {
  await client.end();
}
