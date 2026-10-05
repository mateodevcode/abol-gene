import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { updateParentLink, removeParentLink } from '@/lib/db/relations';

/** PATCH /api/persons/[id]/parents/[parentId] — edita tipo/certeza. */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    const { id, parentId } = await params;
    const body = await req.json().catch(() => ({}));
    const link = await withTransaction((db) => updateParentLink(db, user.id, parentId, id, body));
    return Response.json({ link });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo editar.' }, { status: 400 });
  }
}

/** DELETE — quita el vínculo (borrado lógico). */
export async function DELETE(_req, { params }) {
  try {
    const user = await requireUser();
    const { id, parentId } = await params;
    await withTransaction((db) => removeParentLink(db, user.id, parentId, id));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo quitar.' }, { status: 400 });
  }
}
