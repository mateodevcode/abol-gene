'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Renombra ramas y cambia su color (queda en el historial). */
export default function BranchManager({ initial }) {
  const router = useRouter();
  const [branches, setBranches] = useState(initial ?? []);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4F86C6');
  const [error, setError] = useState('');

  function start(b) {
    setEditing(b.id);
    setName(b.name);
    setColor(b.color);
    setError('');
  }

  async function save(id) {
    setError('');
    const res = await fetch(`/api/branches/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'No se pudo guardar.');
      return;
    }
    setBranches((bs) => bs.map((b) => (b.id === id ? { ...b, name: data.branch.name, color: data.branch.color } : b)));
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {branches.map((b) => (
        <div key={b.id} className="rounded-xl border border-stone-200 px-4 py-3">
          {editing === b.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                aria-label="Nombre de la rama" className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-lg"
              />
              <input
                type="color" value={color} onChange={(e) => setColor(e.target.value)}
                aria-label="Color de la rama" className="h-11 w-14 rounded-xl border border-stone-300"
              />
              <button onClick={() => save(b.id)} className="rounded-xl bg-emerald-700 px-4 py-2 text-lg font-semibold text-white">
                Guardar
              </button>
              <button onClick={() => setEditing(null)} className="rounded-xl border border-stone-300 px-4 py-2 text-lg">
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg">
                <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
                {b.name}
                <span className="text-stone-500"> · {b.persons} personas · {b.missing_birth} sin fecha · {b.missing_parents} con padres por registrar</span>
              </p>
              <button onClick={() => start(b)} className="shrink-0 rounded-xl border border-stone-300 px-3 py-1.5 text-base">
                Editar
              </button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}
    </div>
  );
}
