import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { updateBranch } from '@/lib/db/branches';

/** PATCH /api/branches/[id] { name?, color?, founder_person_id? } */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const branch = await withTransaction((db) => updateBranch(db, user.id, id, body));
    return Response.json({ branch });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo editar.' }, { status: 400 });
  }
}
