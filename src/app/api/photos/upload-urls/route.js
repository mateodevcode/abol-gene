import crypto from 'node:crypto';
import { requireUser } from '@/lib/auth/session';
import { getUploadUrls } from '@/lib/storage/s3';

/**
 * POST /api/photos/upload-urls { ext? } — URLs prefirmadas de subida
 * directa al bucket privado (solo con STORAGE_DRIVER=s3).
 */
export async function POST(req) {
  try {
    await requireUser();
    if ((process.env.STORAGE_DRIVER ?? 'local') !== 's3') {
      return Response.json({ error: 'Subida directa solo con STORAGE_DRIVER=s3.' }, { status: 501 });
    }
    const body = await req.json().catch(() => ({}));
    const ext = String(body.ext ?? 'jpg').replace(/[^a-z]/g, '') || 'jpg';
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return Response.json({ error: 'Formato no válido.' }, { status: 400 });
    }
    const photoId = crypto.randomUUID();
    return Response.json(await getUploadUrls(photoId, ext));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo firmar.' }, { status: 500 });
  }
}
