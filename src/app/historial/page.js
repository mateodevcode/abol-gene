import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { listChanges, canUndo, ACTION_ES_LABEL, ENTITY_ES_LABEL } from '@/lib/db/history';
import { fullName } from '@/lib/format';
import UndoButton from '@/components/history/UndoButton';
import ViewToggle from '@/components/ui/ViewToggle';

const ACTION_LABEL = ACTION_ES_LABEL;
const ENTITY_LABEL = ENTITY_ES_LABEL;

export default async function HistorialPage({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const sp = await searchParams;
  const mine = sp?.filtro === 'mios';
  const changes = await listChanges({ query }, {
    limit: 100,
    user_id: mine || user.role !== 'admin' ? (mine ? user.id : null) : null,
  });

  // Nombres de personas para entidades persona.
  const personIds = [...new Set(changes.filter((c) => c.entity_type === 'person').map((c) => c.entity_id))];
  const names = new Map();
  if (personIds.length) {
    const { rows } = await query('SELECT * FROM persons WHERE id = ANY($1)', [personIds]);
    for (const p of rows) names.set(p.id, fullName(p));
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6">
      <h1 className="text-3xl font-bold text-stone-900">Historial de cambios</h1>
      <p className="mt-2 text-lg text-stone-600">
        {user.role === 'admin' ? 'Ves todo. Puedes deshacer cualquier cambio.' : 'Ves el historial. Puedes deshacer tus propios cambios.'}
      </p>
      <div className="mt-4 flex gap-2 text-lg">
        <a href="/historial" className={`rounded-full px-4 py-2 ${!mine ? 'bg-stone-800 text-white' : 'border border-stone-300'}`}>Todos</a>
        <a href="/historial?filtro=mios" className={`rounded-full px-4 py-2 ${mine ? 'bg-stone-800 text-white' : 'border border-stone-300'}`}>Míos</a>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {changes.length === 0 && <p className="text-lg text-stone-500">Sin cambios todavía.</p>}
        {changes.map((c) => {
          const ok = canUndo(c, user);
          const target = c.entity_type === 'person' ? (names.get(c.entity_id) ?? 'alguien') : c.entity_id.slice(0, 8);
          return (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-lg">
                  <span className="font-semibold">{c.actor_name ?? c.actor_email ?? 'Alguien'}</span>{' '}
                  {ACTION_LABEL[c.action] ?? c.action}{' '}
                  {c.action === 'merge' ? 'duplicados' : `${ENTITY_LABEL[c.entity_type] ?? c.entity_type} ${target}`}
                </p>
                <p className="text-sm text-stone-500">
                  {new Date(c.created_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                  {c.action === 'restore' ? ' · restauración' : ''}
                </p>
              </div>
              <UndoButton
                changeId={c.id}
                disabledReason={c.action === 'restore' ? '—' : !ok ? 'Solo el autor' : null}
              />
            </div>
          );
        })}
      </div>

      <ViewToggle mode="data" personId={user.person_id} />
    </main>
  );
}
