import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { pendingInviteFor } from '@/lib/auth/magic';
import { redeemInvite, validateInvite } from '@/lib/auth/invites';
import { query } from '@/lib/db/client';
import PersonPicker from '@/components/auth/PersonPicker';
import SignOutButton from '@/components/auth/SignOutButton';

export default async function BienvenidaPage({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.person_id) redirect('/arbol');

  const sp = await searchParams;
  const code = sp?.code ?? (await pendingInviteFor(user.email));
  if (!code) {
    // Solo local: vincularse sin invitación (en producción se exige).
    if (process.env.NODE_ENV !== 'production') {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
          <div>
            <h1 className="text-3xl font-bold text-stone-900">Bienvenido (desarrollo)</h1>
            <p className="mt-2 text-lg text-stone-600">
              Sin invitación en local: busca tu nombre para vincular tu cuenta con tu persona de prueba.
            </p>
          </div>
          <PersonPicker inviteCode={null} />
        </main>
      );
    }
    return <Blocked />;
  }
  const v = await validateInvite(code);
  if (!v.ok) {
    return <Blocked reason={v.reason} />;
  }
  if (v.invite.target_person_id) {
    // Invitación ligada a una persona: vínculo automático.
    const me = await query('SELECT person_id FROM users WHERE id=$1', [user.id]);
    if (!me.rows[0]?.person_id) {
      await redeemInvite({ userId: user.id, code });
    }
    redirect('/arbol');
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Bienvenido al árbol</h1>
        <p className="mt-2 text-lg text-stone-600">Busca tu nombre para vincular tu cuenta con tu persona.</p>
      </div>
      <PersonPicker inviteCode={code} />
    </main>
  );
}

function Blocked({ reason }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold text-stone-900">Necesitas una invitación</h1>
      <p className="text-lg text-stone-600">
        {reason ?? 'Tu cuenta aún no está vinculada. Pide a un administrador que te invite.'}
      </p>
      <SignOutButton label="Salir e intentarlo de nuevo" />
    </main>
  );
}
