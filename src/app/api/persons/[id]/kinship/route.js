import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getKinship } from '@/lib/db/kinship';

/** GET /api/persons/[id]/kinship?to=<id> — etiqueta en español + ruta. */
export async function GET(req, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    const to = new URL(req.url).searchParams.get('to');
    if (!to) return Response.json({ error: 'Falta ?to=.' }, { status: 400 });
    const result = await getKinship({ query }, id, to);
    return Response.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'Error.' }, { status: 404 });
  }
}
