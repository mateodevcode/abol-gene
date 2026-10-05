import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { updatePhoto, deletePhoto } from '@/lib/db/photos';

/** PATCH /api/photos/[id] — edita caption/fecha. */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const photo = await withTransaction((db) => updatePhoto(db, user.id, id, body));
    return Response.json({ photo });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo editar.' }, { status: 400 });
  }
}

/** DELETE /api/photos/[id] — borrado lógico (suelta portadas). */
export async function DELETE(_req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await withTransaction((db) => deletePhoto(db, user.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo borrar.' }, { status: 400 });
  }
}
