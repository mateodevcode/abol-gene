import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { tagPhoto, untagPhoto } from '@/lib/db/photos';

/** POST /api/photos/[id]/tags { person_id } — etiqueta. */
export async function POST(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (!body.person_id) return Response.json({ error: 'Falta person_id.' }, { status: 400 });
    await withTransaction((db) => tagPhoto(db, user.id, id, body.person_id));
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo etiquetar.' }, { status: 400 });
  }
}

/** DELETE /api/photos/[id]/tags?person_id= — quita etiqueta. */
export async function DELETE(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const personId = new URL(req.url).searchParams.get('person_id');
    if (!personId) return Response.json({ error: 'Falta person_id.' }, { status: 400 });
    await withTransaction((db) => untagPhoto(db, user.id, id, personId));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo quitar.' }, { status: 400 });
  }
}
