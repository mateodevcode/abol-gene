import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { listPendingCandidates } from '@/lib/db/duplicates';
import DuplicateManager from '@/components/admin/DuplicateManager';
import ViewToggle from '@/components/ui/ViewToggle';

export default async function DuplicadosPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/arbol');
  const candidates = await listPendingCandidates({ query });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6">
      <h1 className="text-3xl font-bold text-stone-900">Duplicados por revisar</h1>
      <p className="mt-2 text-lg text-stone-600">
        Elige cuál conservar; todo lo de la otra (padres, hijos, historias, fotos)
        se mueve a la conservada. Se puede deshacer desde el historial.
      </p>
      <div className="mt-6">
        <DuplicateManager initial={candidates} />
      </div>
      <ViewToggle mode="data" personId={user.person_id} />
    </main>
  );
}
