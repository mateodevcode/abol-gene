import { requireUser, requireAdmin } from '@/lib/auth/session';
import { query, withTransaction } from '@/lib/db/client';
import { listChanges, undoChange } from '@/lib/db/history';

/** GET /api/history — historial con actor (sesión). Filtros: ?entity_type=&mine=1 */
export async function GET(req) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const mine = sp.get('mine') === '1' && user.role !== 'admin';
    const changes = await listChanges({ query }, {
      limit: sp.get('limit') ?? 100,
      entity_type: sp.get('entity_type') || null,
      user_id: mine ? user.id : null,
    });
    return Response.json({ changes });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
