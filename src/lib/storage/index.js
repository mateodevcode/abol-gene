import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Driver `local` (desarrollo): guarda en /.local-uploads (fuera de git),
 * servido solo a usuarios con sesión vía /api/photos/[id]/[size].
 * El driver `s3` llega en Fase 9 con la misma forma de claves.
 */

const ROOT = path.join(process.cwd(), '.local-uploads');
const SIZES = ['original', 'medium', 'thumb'];

function safeKey(key) {
  if (typeof key !== 'string' || !key.startsWith('local/') || key.includes('..')) {
    throw new Error('Clave de foto no válida.');
  }
  return path.join(ROOT, key.slice('local/'.length));
}

export function photoKey(photoId, size, ext) {
  if (!SIZES.includes(size)) throw new Error('Tamaño no válido.');
  const cleanExt = String(ext).replace(/[^a-z]/g, '') || 'jpg';
  return `local/${photoId}/${size}.${cleanExt}`;
}

/**
 * Guarda los 3 archivos (ya generados en el navegador). Orden: disco
 * primero, DB después (si la DB falla, se borran los archivos).
 */
export async function savePhotoFiles(photoId, files) {
  const keys = {};
  const dir = path.join(ROOT, photoId);
  await fs.mkdir(dir, { recursive: true });
  try {
    for (const size of SIZES) {
      const f = files[size];
      if (!f?.buffer?.length) throw new Error(`Falta el archivo ${size}.`);
      const key = photoKey(photoId, size, f.ext);
      await fs.writeFile(safeKey(key), f.buffer);
      keys[size] = key;
    }
    return keys;
  } catch (e) {
    await fs.rm(dir, { recursive: true, force: true });
    throw e;
  }
}

export async function deletePhotoFiles(photoId) {
  await fs.rm(path.join(ROOT, photoId), { recursive: true, force: true });
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Lee un archivo para servirlo (solo con sesión, en el route handler). */
export async function readPhotoFile(key) {
  const buf = await fs.readFile(safeKey(key));
  const ext = key.split('.').pop()?.toLowerCase() ?? 'jpg';
  return { buffer: buf, contentType: MIME[ext] ?? 'image/jpeg' };
}

/** URL servida por el backend (driver local). Con s3 será firmada (Fase 9). */
export { photoUrl } from '@/lib/photo-url';
