import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getStats } from '@/lib/db/stats';
import PersonLink from '@/components/person/PersonLink';
import ViewToggle from '@/components/ui/ViewToggle';

export default async function EstadisticasPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.person_id) redirect('/bienvenida');
  const s = await getStats({ query });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6">
      <h1 className="text-3xl font-bold text-stone-900">Estadísticas familiares</h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="Personas" value={s.total_persons} />
        <Stat label="Vivas" value={s.living} />
        <Stat label="Generaciones" value={s.generations} />
        <Stat label="Ramas" value={s.branches} />
        <Stat label="Uniones" value={s.unions} />
        <Stat label="Historias" value={s.stories} />
      </div>

      {s.biggest_branch && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold">Rama más numerosa</h2>
          <p className="mt-2 text-xl">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.biggest_branch.color }} />{' '}
            {s.biggest_branch.name}: {s.biggest_branch.count} personas
          </p>
        </section>
      )}

      {s.longest_lived && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold">Más longevo</h2>
          <p className="mt-2 text-xl">
            {s.longest_lived.given_names} {s.longest_lived.paternal_surname}: {s.longest_lived.years} años
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-2xl font-bold">Cumpleaños del mes ({s.birthdays_this_month.length})</h2>
        <div className="mt-3 flex flex-col gap-2">
          {s.birthdays_this_month.length === 0 && <p className="text-lg text-stone-500">Nadie este mes.</p>}
          {s.birthdays_this_month.map((p) => (
            <PersonLink key={p.id} person={p} sub={`Cumple el ${p.day}`} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold">Ramas con huecos por completar</h2>
        <div className="mt-3 flex flex-col gap-2">
          {s.branch_gaps.map((b) => (
            <div key={b.id} className="rounded-xl border border-stone-200 px-4 py-3 text-lg">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} /> {b.name}
              <span className="text-stone-500"> · {b.persons} personas · {b.missing_birth} sin fecha · {b.missing_parents} con padres por registrar</span>
            </div>
          ))}
        </div>
      </section>

      <ViewToggle mode="data" personId={user.person_id} />
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-stone-200 p-4 text-center">
      <p className="text-4xl font-bold text-stone-900">{value ?? '–'}</p>
      <p className="mt-1 text-lg text-stone-600">{label}</p>
    </div>
  );
}
