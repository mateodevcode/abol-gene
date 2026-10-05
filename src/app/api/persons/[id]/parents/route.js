import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { addParentLink } from '@/lib/db/relations';

/** POST /api/persons/[id]/parents — agrega { parent_id, kind?, certainty? }. */
export async function POST(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (!body.parent_id) return Response.json({ error: 'Falta parent_id.' }, { status: 400 });
    const link = await withTransaction((db) => addParentLink(db, user.id, {
      parent_id: body.parent_id,
      child_id: id,
      kind: body.kind ?? 'biological',
      certainty: body.certainty ?? 'confirmed',
    }));
    return Response.json({ link }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo agregar.' }, { status: 400 });
  }
}
