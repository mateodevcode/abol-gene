import { requireAdmin } from '@/lib/auth/session';
import { query, withTransaction } from '@/lib/db/client';
import { dismissCandidate } from '@/lib/db/duplicates';
import { mergePersons } from '@/lib/db/history';

/** POST /api/duplicates/[id] { keep_id } — fusiona (admin). */
export async function POST(req, { params }) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { rows: [cand] } = await query("SELECT * FROM merge_candidates WHERE id=$1 AND status='pending'", [id]);
    if (!cand) return Response.json({ error: 'Candidato no encontrado.' }, { status: 404 });
    const keep = body.keep_id === cand.person_b_id ? cand.person_b_id : cand.person_a_id;
    const drop = keep === cand.person_a_id ? cand.person_b_id : cand.person_a_id;
    const result = await withTransaction((db) => mergePersons(db, user.id, keep, drop));
    return Response.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo fusionar.' }, { status: 400 });
  }
}

/** DELETE /api/duplicates/[id] — descarta (admin). */
export async function DELETE(_req, { params }) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    await withTransaction((db) => dismissCandidate(db, user.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo descartar.' }, { status: 400 });
  }
}
