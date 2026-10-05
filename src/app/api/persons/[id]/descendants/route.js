import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getDescendants } from '@/lib/db/tree';

/** GET /api/persons/[id]/descendants — agrupada por hijo y generación. */
export async function GET(req, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    const result = await getDescendants({ query }, id, {});
    return Response.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
