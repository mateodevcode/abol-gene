import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getStats } from '@/lib/db/stats';

/** GET /api/stats — resumen familiar. */
export async function GET() {
  try {
    await requireUser();
    return Response.json(await getStats({ query }));
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
