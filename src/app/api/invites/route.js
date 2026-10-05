import { requireAdmin } from '@/lib/auth/session';
import { createInvite, listInvites, canInvite } from '@/lib/auth/invites';

/** GET /api/invites — lista (quien puede invitar). */
export async function GET() {
  try {
    const user = await requireAdmin().catch(async () => null);
    if (!user || !canInvite(user.role)) {
      return Response.json({ error: 'Solo administradores.' }, { status: 403 });
    }
    return Response.json({ invites: await listInvites() });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** POST /api/invites — crea invitación { target_person_id?, expires_in_days? }. */
export async function POST(req) {
  try {
    const user = await requireAdmin().catch(async () => null);
    if (!user || !canInvite(user.role)) {
      return Response.json({ error: 'Solo administradores.' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const invite = await createInvite({
      invitedBy: user.id,
      targetPersonId: body.target_person_id ?? null,
      expiresInDays: Number(body.expires_in_days ?? 30) || 30,
    });
    const base = process.env.NEXTAUTH_URL ?? '';
    return Response.json({
      invite,
      url: `${base}/join/${invite.code}`,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'No se pudo crear la invitación.' }, { status: 500 });
  }
}
