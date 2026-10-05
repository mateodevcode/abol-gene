import crypto from 'node:crypto';
import { logChange } from '@/lib/db/change-log';
import { savePhotoFiles, deletePhotoFiles } from '@/lib/storage/index';

const SIZES = ['original', 'medium', 'thumb'];
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = { original: 10 * 1024 * 1024, medium: 5 * 1024 * 1024, thumb: 512 * 1024 };

/**
 * Confirma una subida: guarda archivos (disco primero) y crea la fila,
 * etiquetas y portada opcional en una transacción. Si la DB falla, borra archivos.
 */
export async function confirmPhotoUpload(db, userId, { files, caption, photo_date, width, height, size_bytes, person_ids = [], make_cover_for = null }) {
  for (const size of SIZES) {
    const f = files[size];
    if (!f?.buffer?.length) throw new Error(`Falta el archivo ${size} (el navegador genera los 3 tamaños).`);
    if (!MIME_EXT[f.mime]) throw new Error(`Tipo no válido en ${size}: usa JPG, PNG o WebP.`);
    if (f.buffer.length > MAX_BYTES[size]) throw new Error(`El archivo ${size} supera el máximo permitido.`);
  }
  const mimes = new Set(SIZES.map((s) => files[s].mime));
  if (mimes.size > 1) throw new Error('Los 3 tamaños deben tener el mismo formato.');
  const ext = MIME_EXT[files.original.mime];

  const photoId = crypto.randomUUID();
  const withExt = {};
  for (const size of SIZES) withExt[size] = { buffer: files[size].buffer, ext };
  const keys = await savePhotoFiles(photoId, withExt);
  try {
    return await createPhotoRows(db, userId, {
      photoId, keys, caption, photo_date, width, height, size_bytes, person_ids, make_cover_for,
    });
  } catch (e) {
    await deletePhotoFiles(photoId);
    throw e;
  }
}

/**
 * Crea fila + etiquetas + portada (los archivos ya están guardados:
 * disco en local, S3 tras el PUT directo en producción).
 */
export async function createPhotoRows(db, userId, { photoId, keys, caption, photo_date, width, height, size_bytes, person_ids = [], make_cover_for = null }) {
  const { rows: [photo] } = await db.query(
    `INSERT INTO photos (id, storage_key_original, storage_key_medium, storage_key_thumb,
       uploaded_by, caption, photo_date, width, height, size_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [photoId, keys.original, keys.medium, keys.thumb, userId,
      caption?.trim() || null, photo_date || null,
      Number(width) || null, Number(height) || null, Number(size_bytes) || null]);
  const tagged = [];
  for (const pid of [...new Set(person_ids)].filter(Boolean)) {
    const t = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [pid]);
    if (!t.rows[0]) continue;
    await db.query('INSERT INTO photo_tags (photo_id, person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [photoId, pid]);
    tagged.push(pid);
    await logChange(db, { entity_type: 'photo_tag', entity_id: photoId, action: 'create', after: { photo_id: photoId, person_id: pid }, user_id: userId });
  }
  if (make_cover_for) {
    if (!tagged.includes(make_cover_for)) throw new Error('Para ser portada, la persona debe estar etiquetada.');
    const { rows: [before] } = await db.query('SELECT id, cover_photo_id FROM persons WHERE id=$1 AND deleted_at IS NULL', [make_cover_for]);
    if (!before) throw new Error('Persona no encontrada.');
    await db.query('UPDATE persons SET cover_photo_id=$1 WHERE id=$2', [photoId, make_cover_for]);
    await logChange(db, {
      entity_type: 'person', entity_id: make_cover_for, action: 'update',
      before: { cover_photo_id: before.cover_photo_id }, after: { cover_photo_id: photoId }, user_id: userId,
    });
  }
  await logChange(db, { entity_type: 'photo', entity_id: photoId, action: 'create', after: photo, user_id: userId });
  return { ...photo, tagged };
}

export async function updatePhoto(db, userId, id, { caption, photo_date }) {
  const { rows: [before] } = await db.query('SELECT * FROM photos WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Foto no encontrada.');
  const { rows: [after] } = await db.query(
    'UPDATE photos SET caption=COALESCE($2,caption), photo_date=COALESCE($3,photo_date) WHERE id=$1 AND deleted_at IS NULL RETURNING *',
    [id, caption ?? null, photo_date || null]);
  await logChange(db, { entity_type: 'photo', entity_id: id, action: 'update', before, after, user_id: userId });
  return after;
}

export async function deletePhoto(db, userId, id) {
  const { rows: [before] } = await db.query('SELECT * FROM photos WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) throw new Error('Foto no encontrada.');
  await db.query('UPDATE photos SET deleted_at=now() WHERE id=$1', [id]);
  // Si era portada de alguien, se suelta (el avatar vuelve a iniciales).
  await db.query('UPDATE persons SET cover_photo_id=NULL WHERE cover_photo_id=$1', [id]);
  await logChange(db, { entity_type: 'photo', entity_id: id, action: 'delete', before, user_id: userId });
  return true;
}

export async function tagPhoto(db, userId, photoId, personId) {
  const ph = await db.query('SELECT id FROM photos WHERE id=$1 AND deleted_at IS NULL', [photoId]);
  if (!ph.rows[0]) throw new Error('Foto no encontrada.');
  const ps = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [personId]);
  if (!ps.rows[0]) throw new Error('Persona no encontrada.');
  await db.query('INSERT INTO photo_tags (photo_id, person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [photoId, personId]);
  await logChange(db, { entity_type: 'photo_tag', entity_id: photoId, action: 'create', after: { photo_id: photoId, person_id: personId }, user_id: userId });
  return true;
}

export async function untagPhoto(db, userId, photoId, personId) {
  await db.query('DELETE FROM photo_tags WHERE photo_id=$1 AND person_id=$2', [photoId, personId]);
  await logChange(db, { entity_type: 'photo_tag', entity_id: photoId, action: 'delete', before: { photo_id: photoId, person_id: personId }, user_id: userId });
  return true;
}
