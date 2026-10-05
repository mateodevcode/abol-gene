import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import NewPersonForm from '@/components/person/NewPersonForm';
import ViewToggle from '@/components/ui/ViewToggle';

export default async function NuevaPersonaPage({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const sp = await searchParams;
  // ?progenitor=<id>: viene de un hueco del mapa o de Conectar (hijo ya elegido).
  let progenitor = null;
  if (sp?.progenitor) {
    const { rows: [p] } = await query(
      'SELECT id, given_names, paternal_surname, maternal_surname FROM persons WHERE id=$1 AND deleted_at IS NULL',
      [sp.progenitor]);
    progenitor = p ?? null;
  }
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6">
      <h1 className="text-3xl font-bold text-stone-900">Agregar persona</h1>
      <p className="mt-2 text-lg text-stone-600">
        {progenitor
          ? `Será padre o madre de ${progenitor.given_names} ${progenitor.paternal_surname ?? ''}.`
          : 'Empieza por ti o por el familiar más cercano que recuerdes bien.'}
      </p>
      <div className="mt-6">
        <NewPersonForm progenitor={progenitor} />
      </div>
      <ViewToggle mode="data" personId={user.person_id} />
    </main>
  );
}
