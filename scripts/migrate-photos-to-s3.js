// Migra fotos del driver local (/.local-uploads) al bucket S3 y actualiza
// las claves en la DB. Uso una sola vez al pasar a producción:
//   STORAGE_DRIVER=s3 node --env-file=.env.local scripts/migrate-photos-to-s3.js
// No borra los archivos locales (quedan como respaldo, fuera de git).
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import pkg from '@aws-sdk/client-s3';

const { S3Client, PutObjectCommand } = pkg;

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const s3 = new S3Client({
  region: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const Bucket = process.env.AWS_BUCKET;
const prefix = `${process.env.AWS_BUCKET_SUBFOLDER ?? 'arbol-gene'}/`;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const { rows } = await db.query(
    "SELECT id, storage_key_original, storage_key_medium, storage_key_thumb FROM photos WHERE storage_key_original LIKE 'local/%' AND deleted_at IS NULL");
  console.log(`fotos locales: ${rows.length}`);
  for (const ph of rows) {
    const keys = {};
    for (const size of ['original', 'medium', 'thumb']) {
      const oldKey = ph[`storage_key_${size}`];
      const m = oldKey.match(/^local\/([^/]+)\/[^.]+\.(jpg|jpeg|png|webp)$/);
      if (!m) throw new Error(`Clave inesperada: ${oldKey}`);
      const [, pid, ext] = m;
      const buf = await fs.readFile(path.join(process.cwd(), '.local-uploads', pid, `${size}.${ext}`));
      const Key = `${prefix}${pid}/${size}.${ext}`;
      await s3.send(new PutObjectCommand({
        Bucket, Key, Body: buf, ContentType: MIME[ext] ?? 'image/jpeg',
      }));
      keys[size] = Key;
    }
    await db.query(
      'UPDATE photos SET storage_key_original=$1, storage_key_medium=$2, storage_key_thumb=$3 WHERE id=$4',
      [keys.original, keys.medium, keys.thumb, ph.id]);
    console.log(`migrada ${ph.id}`);
  }
  console.log('OK');
} finally {
  await db.end();
}
