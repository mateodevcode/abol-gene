import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { getInvitePreview, validateInvite } from '@/lib/auth/invites';
import LoginForm from '@/components/auth/LoginForm';

export default async function JoinPage({ params }) {
  const { code } = await params;
  if ((await currentUser())?.person_id) redirect('/arbol');
  const preview = await getInvitePreview(code);
  if (!preview) notFound();
  const v = await validateInvite(code);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Te invitaron al árbol familiar</h1>
        <p className="mt-2 text-lg text-stone-600">
          {preview.inviter_name
            ? `${preview.inviter_name} te invitó a unirte.`
            : 'Tienes una invitación para unirte.'}
          {preview.target_name?.trim() ? ` Tu persona: ${preview.target_name}.` : ''}
        </p>
      </div>
      {v.ok ? (
        <LoginForm inviteCode={code} />
      ) : (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{v.reason}</p>
      )}
    </main>
  );
}
