import { requireUser } from '@/lib/auth/session';
import { query, withTransaction } from '@/lib/db/client';
import { listBranches, createBranch } from '@/lib/db/branches';

/** GET /api/branches — lista con conteos. */
export async function GET() {
  try {
    await requireUser();
    return Response.json({ branches: await listBranches({ query }) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** POST /api/branches { name, color?, founder_person_id? } */
export async function POST(req) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const branch = await withTransaction((db) => createBranch(db, user.id, body));
    return Response.json({ branch }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo crear.' }, { status: 400 });
  }
}
