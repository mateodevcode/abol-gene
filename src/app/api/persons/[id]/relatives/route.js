import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getSiblings, getUnclesAunts, getCousins } from '@/lib/db/tree';

/** GET /api/persons/[id]/relatives — hermanos, medios, tíos y primos. */
export async function GET(_req, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    const db = { query };
    const [siblings, uncles, cousins] = await Promise.all([
      getSiblings(db, id), getUnclesAunts(db, id), getCousins(db, id),
    ]);
    return Response.json({ siblings, uncles, cousins });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
