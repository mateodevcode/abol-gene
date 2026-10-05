import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getTreeAround } from '@/lib/db/tree';

/** GET /api/persons/[id]/tree?up=2&down=2&full=1 — subgrafo o árbol completo. */
export async function GET(req, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    const sp = new URL(req.url).searchParams;
    const full = sp.get('full') === '1';
    const tree = await getTreeAround({ query }, id, full
      ? { up: 30, down: 30, full: true }
      : { up: sp.get('up'), down: sp.get('down') });
    return Response.json(tree);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'Error.' }, { status: 404 });
  }
}
