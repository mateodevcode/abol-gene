import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { createPhotoRows } from '@/lib/db/photos';
import { assertObjectsExist, s3Key } from '@/lib/storage/s3';

/**
 * POST /api/photos/confirm — tras el PUT directo a S3: verifica los objetos
 * y crea fila + etiquetas + portada (solo con STORAGE_DRIVER=s3).
 */
export async function POST(req) {
  try {
    const user = await requireUser();
    if ((process.env.STORAGE_DRIVER ?? 'local') !== 's3') {
      return Response.json({ error: 'Confirmación S3 solo con STORAGE_DRIVER=s3.' }, { status: 501 });
    }
    const body = await req.json().catch(() => ({}));
    const { photoId, ext = 'jpg' } = body;
    if (!photoId) return Response.json({ error: 'Falta photoId.' }, { status: 400 });
    const keys = {
      original: s3Key(photoId, 'original', ext),
      medium: s3Key(photoId, 'medium', ext),
      thumb: s3Key(photoId, 'thumb', ext),
    };
    try {
      await assertObjectsExist(keys);
    } catch {
      return Response.json({ error: 'Los archivos no llegaron al bucket. Reintenta.' }, { status: 400 });
    }
    const photo = await withTransaction((db) => createPhotoRows(db, user.id, {
      photoId,
      keys,
      caption: body.caption ?? null,
      photo_date: body.photo_date ?? null,
      width: body.width ?? null,
      height: body.height ?? null,
      size_bytes: body.size_bytes ?? null,
      person_ids: Array.isArray(body.person_ids) ? body.person_ids : [],
      make_cover_for: body.make_cover_for ?? null,
    }));
    return Response.json({ photo }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo confirmar.' }, { status: 400 });
  }
}
