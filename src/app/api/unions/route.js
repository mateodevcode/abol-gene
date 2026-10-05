import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { createUnion } from '@/lib/db/relations';

/** POST /api/unions — crea una unión { person_a_id, person_b_id, kind?, ... }. */
export async function POST(req) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const union = await withTransaction((db) => createUnion(db, user.id, body));
    return Response.json({ union }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo crear.' }, { status: 400 });
  }
}
