import { getInvitePreview, validateInvite } from '@/lib/auth/invites';

/** GET /api/invites/[code] — vista previa pública (para /join). */
export async function GET(_req, { params }) {
  const { code } = await params;
  const preview = await getInvitePreview(code);
  if (!preview) return Response.json({ error: 'Invitación no válida.' }, { status: 404 });
  const v = await validateInvite(code);
  return Response.json({ ...preview, valid: v.ok, reason: v.reason ?? null });
}
