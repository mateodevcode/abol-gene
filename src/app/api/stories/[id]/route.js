import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { updateStory, deleteStory } from '@/lib/db/content';

/** PATCH /api/stories/[id] — edita (cualquiera puede corregir; queda firmado). */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const story = await withTransaction((db) => updateStory(db, user.id, id, body));
    return Response.json({ story });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo editar.' }, { status: 400 });
  }
}

/** DELETE /api/stories/[id] — borrado lógico. */
export async function DELETE(_req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await withTransaction((db) => deleteStory(db, user.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo borrar.' }, { status: 400 });
  }
}
