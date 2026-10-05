import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { updateFact, deleteFact } from '@/lib/db/content';

/** PATCH /api/facts/[id] */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const fact = await withTransaction((db) => updateFact(db, user.id, id, body));
    return Response.json({ fact });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo editar.' }, { status: 400 });
  }
}

/** DELETE /api/facts/[id] */
export async function DELETE(_req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await withTransaction((db) => deleteFact(db, user.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo borrar.' }, { status: 400 });
  }
}
