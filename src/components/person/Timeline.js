import { formatDate } from '@/lib/format';

/**
 * Línea de vida ordenada por año: nacimiento, uniones, historias con fecha,
 * fotos con fecha y fallecimiento.
 */
export default function Timeline({ profile }) {
  const { person, partners, stories, photos } = profile;
  const events = [];
  if (person.birth_date) {
    events.push({ date: person.birth_date, label: `Nace${person.birth_place ? ` en ${person.birth_place}` : ''}`, dateStr: formatDate(person.birth_date, person.birth_date_precision) });
  }
  for (const p of partners ?? []) {
    if (p.start_date) {
      events.push({
        date: p.start_date,
        label: `${p.union_kind === 'marriage' ? 'Matrimonio' : p.union_kind === 'free_union' ? 'Unión libre' : 'Pareja'} con ${p.given_names} ${p.paternal_surname ?? ''}`.trim(),
        dateStr: formatDate(p.start_date, p.start_date_precision),
      });
    }
  }
  for (const s of stories ?? []) {
    if (s.story_date) {
      events.push({ date: s.story_date, label: s.title || 'Historia', dateStr: formatDate(s.story_date, s.story_date_precision) });
    }
  }
  for (const ph of photos ?? []) {
    if (ph.photo_date) {
      events.push({ date: ph.photo_date, label: ph.caption || 'Foto', dateStr: formatDate(ph.photo_date, 'day') });
    }
  }
  if (person.death_date) {
    events.push({ date: person.death_date, label: `Fallece${person.death_place ? ` en ${person.death_place}` : ''}`, dateStr: formatDate(person.death_date, person.death_date_precision) });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!events.length) return <p className="text-lg text-stone-500">Sin eventos con fecha todavía.</p>;

  return (
    <ol className="relative ml-2 border-l-2 border-stone-200">
      {events.map((e, i) => (
        <li key={i} className="mb-4 ml-4">
          <span className="absolute -left-2 mt-1.5 h-3 w-3 rounded-full bg-emerald-700" aria-hidden />
          <p className="text-lg font-semibold text-stone-900">{e.label}</p>
          <p className="text-base text-stone-500">{e.dateStr}</p>
        </li>
      ))}
    </ol>
  );
}
