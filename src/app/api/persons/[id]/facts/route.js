import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { createFact, updateFact, deleteFact } from '@/lib/db/content';

/** POST /api/persons/[id]/facts — agrega dato con fuente y certeza. */
export async function POST(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const fact = await withTransaction((db) => createFact(db, user.id, id, body));
    return Response.json({ fact }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo guardar.' }, { status: 400 });
  }
}
