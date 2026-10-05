'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** Buscador "soy esta persona" para invitaciones sin persona asignada. */
export default function PersonPicker({ inviteCode }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function search(e) {
    e.preventDefault();
    setError('');
    setSearched(false);
    const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.persons ?? []);
    setSearched(true);
  }

  async function choose(id) {
    setError('');
    const res = await fetch('/api/me/link-person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode, person_id: id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'No se pudo vincular.');
      return;
    }
    router.push('/arbol');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Busca tu nombre" className="flex-1 rounded-xl border border-stone-300 px-4 py-3 text-lg"
        />
        <button className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white">Buscar</button>
      </form>
      {results.map((p) => (
        <button
          key={p.id} onClick={() => choose(p.id)}
          className="rounded-xl border border-stone-200 px-4 py-3 text-left text-lg hover:bg-stone-50"
        >
          <span className="font-semibold">{p.given_names} {p.paternal_surname} {p.maternal_surname}</span>
          {p.nickname ? ` "${p.nickname}"` : ''}
          {p.birth_date ? <span className="text-stone-500"> · {String(p.birth_date).slice(0, 4)}</span> : null}
        </button>
      ))}
      {searched && results.length === 0 && (
        <p className="rounded-xl bg-stone-100 px-4 py-3 text-lg">
          Sin resultados. Si la persona aún no existe,{' '}
          <Link href="/persona/nueva" className="font-semibold text-emerald-800 underline">créala aquí</Link>.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}
    </div>
  );
}
