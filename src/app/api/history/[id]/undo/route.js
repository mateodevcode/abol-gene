import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { undoChange } from '@/lib/db/history';

/** POST /api/history/[id]/undo — deshace (propios, o cualquiera si admin). */
export async function POST(_req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await withTransaction((db) => undoChange(db, user, id));
    return Response.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    const status = /Solo puedes/.test(e.message ?? '') ? 403 : 400;
    return Response.json({ error: e.message ?? 'No se pudo deshacer.' }, { status });
  }
}
