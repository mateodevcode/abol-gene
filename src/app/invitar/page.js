import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { canInvite } from '@/lib/auth/invites';
import InviteManager from '@/components/auth/InviteManager';

export default async function InvitarPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canInvite(user.role)) redirect('/arbol');
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold text-stone-900">Invitar familiares</h1>
      <InviteManager />
    </main>
  );
}
