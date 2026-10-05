import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { confirmPhotoUpload } from '@/lib/db/photos';

/**
 * POST /api/photos/upload (multipart): original, medium, thumb (generados en
 * el navegador) + caption, photo_date, width, height, size_bytes,
 * person_ids (JSON), make_cover_for (uuid opcional).
 */
export async function POST(req) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const files = {};
    for (const size of ['original', 'medium', 'thumb']) {
      const blob = form.get(size);
      if (blob && typeof blob.arrayBuffer === 'function') {
        files[size] = { buffer: Buffer.from(await blob.arrayBuffer()), mime: blob.type };
      }
    }
    let person_ids = [];
    try {
      const raw = form.get('person_ids');
      if (raw) person_ids = JSON.parse(String(raw));
    } catch { /* sin etiquetas */ }
    const photo = await withTransaction((db) => confirmPhotoUpload(db, user.id, {
      files,
      caption: form.get('caption') ? String(form.get('caption')) : null,
      photo_date: form.get('photo_date') ? String(form.get('photo_date')) : null,
      width: form.get('width') ? String(form.get('width')) : null,
      height: form.get('height') ? String(form.get('height')) : null,
      size_bytes: form.get('size_bytes') ? String(form.get('size_bytes')) : null,
      person_ids: Array.isArray(person_ids) ? person_ids : [],
      make_cover_for: form.get('make_cover_for') ? String(form.get('make_cover_for')) : null,
    }));
    return Response.json({ photo }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo subir.' }, { status: 400 });
  }
}
