'use client';

import { useState } from 'react';
import PersonAvatar from '@/components/person/PersonAvatar';
import { fullName } from '@/lib/format';

/** Buscador para saltar a otra ficha. */
export default function PersonSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  async function search(e) {
    e.preventDefault();
    const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults((await res.json()).persons ?? []);
  }

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar persona…" aria-label="Buscar persona"
          className="flex-1 rounded-xl border border-stone-300 px-4 py-3 text-lg"
        />
        <button className="rounded-xl bg-stone-800 px-4 py-3 text-lg font-semibold text-white">Ir</button>
      </form>
      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {results.map((p) => (
            <a key={p.id} href={`/persona/${p.id}`} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2 hover:bg-stone-50">
              <PersonAvatar person={p} size="sm" />
              <span className="text-lg">{fullName(p)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
