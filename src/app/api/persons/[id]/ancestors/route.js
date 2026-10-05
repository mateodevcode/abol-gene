import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getAncestors } from '@/lib/db/tree';

/** GET /api/persons/[id]/ancestors — ascendencia hasta donde llegue. */
export async function GET(_req, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    const ancestors = await getAncestors({ query }, id, {});
    return Response.json({ ancestors });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
