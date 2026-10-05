import { requireUser } from '@/lib/auth/session';
import { redeemInvite, linkOwnPerson, validateInvite } from '@/lib/auth/invites';
import { pendingInviteFor } from '@/lib/auth/magic';

/**
 * POST /api/me/link-person — vincula mi cuenta con mi persona.
 * Body: { code?, person_id? }. Si el código trae target_person_id, se vincula
 * directo; si no, usa person_id ("soy esta persona").
 * En desarrollo se permite vincular sin invitación (solo local).
 */
export async function POST(req) {
  try {
    const user = await requireUser();
    if (user.person_id) return Response.json({ person_id: user.person_id });
    const body = await req.json().catch(() => ({}));
    const code = body.code ?? (await pendingInviteFor(user.email));
    if (body.person_id && !code) {
      if (process.env.NODE_ENV === 'production') {
        return Response.json({ error: 'Necesitas una invitación válida.' }, { status: 403 });
      }
      // Solo local: "soy esta persona" sin invitación.
      const r = await linkOwnPerson({ userId: user.id, personId: body.person_id });
      return Response.json(r);
    }
    if (code) {
      const v = await validateInvite(code);
      if (!v.ok) return Response.json({ error: v.reason }, { status: 403 });
    }
    if (code) {
      const r = await redeemInvite({ userId: user.id, code, personId: body.person_id ?? null });
      return Response.json(r);
    }
    const r = await linkOwnPerson({ userId: user.id, personId: body.person_id });
    return Response.json(r);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo vincular.' }, { status: 400 });
  }
}
