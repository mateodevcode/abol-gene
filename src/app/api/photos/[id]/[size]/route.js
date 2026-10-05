import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { readPhotoFile } from '@/lib/storage/index';
import { getReadUrl } from '@/lib/storage/s3';

/** GET /api/photos/[id]/[size] — local: archivo; s3: redirect a URL firmada. */
export async function GET(_req, { params }) {
  try {
    await requireUser();
    const { id, size } = await params;
    if (!['original', 'medium', 'thumb'].includes(size)) {
      return Response.json({ error: 'Tamaño no válido.' }, { status: 400 });
    }
    const { rows: [ph] } = await query('SELECT * FROM photos WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!ph) return Response.json({ error: 'Foto no encontrada.' }, { status: 404 });
    const key = size === 'original' ? ph.storage_key_original : size === 'medium' ? ph.storage_key_medium : ph.storage_key_thumb;
    if (!key) return Response.json({ error: 'Tamaño no disponible.' }, { status: 404 });
    if (!key.startsWith('local/')) {
      // Bucket privado: redirección corta a URL firmada (10 min).
      return Response.redirect(await getReadUrl(key), 302);
    }
    try {
      const { buffer, contentType } = await readPhotoFile(key);
      return new Response(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=86400',
          'Content-Length': String(buffer.length),
        },
      });
    } catch {
      return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 });
    }
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
