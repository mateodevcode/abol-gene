import { requireAdmin } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { listPendingCandidates, scanDuplicateCandidates } from '@/lib/db/duplicates';

/** GET /api/duplicates — candidatos pendientes (admin). */
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ candidates: await listPendingCandidates({ query }) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** POST /api/duplicates — rastrea la base y guarda candidatos (admin). */
export async function POST() {
  try {
    await requireAdmin();
    return Response.json(await scanDuplicateCandidates({ query }, {}));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'Error.' }, { status: 500 });
  }
}
