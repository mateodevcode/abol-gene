import { requireUser } from '@/lib/auth/session';
import { withTransaction } from '@/lib/db/client';
import { createStory, updateStory, deleteStory } from '@/lib/db/content';

/** POST /api/persons/[id]/stories — crea historia firmada por mí. */
export async function POST(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const story = await withTransaction((db) => createStory(db, user.id, id, {
      ...body,
      mentions: Array.isArray(body.mentions) ? body.mentions : [],
    }));
    return Response.json({ story }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo guardar.' }, { status: 400 });
  }
}
