import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { updateUnion, deleteUnion } from '@/lib/db/relations';

/** PATCH /api/unions/[id] — edita una unión. */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const union = await withTransaction((db) => updateUnion(db, user.id, id, body));
    return Response.json({ union });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo editar.' }, { status: 400 });
  }
}

/** DELETE /api/unions/[id] — borrado lógico. */
export async function DELETE(_req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await withTransaction((db) => deleteUnion(db, user.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo borrar.' }, { status: 400 });
  }
}
