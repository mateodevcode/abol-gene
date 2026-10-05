import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getProfile } from '@/lib/db/profile';

/** GET /api/persons/[id]/profile — ficha completa del Modo Datos. */
export async function GET(_req, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    return Response.json(await getProfile({ query }, id));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'Error.' }, { status: 404 });
  }
}
