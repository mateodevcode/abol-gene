'use client';

import { useState } from 'react';
import { factTypeEs } from '@/lib/format';

const TYPES = [
  ['occupation', 'Oficio'],
  ['residence', 'Residencia'],
  ['origin', 'Origen'],
  ['anecdote', 'Anécdota corta'],
  ['other', 'Otro'],
];

/** Hechos con certeza y fuente: leer, aportar, editar y borrar. */
export default function Facts({ personId, initialFacts }) {
  const [facts, setFacts] = useState(initialFacts ?? []);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ type: 'anecdote', value: '', certainty: 'confirmed', source: '' });
  const [editing, setEditing] = useState(null);

  async function create(e) {
    e.preventDefault();
    setError('');
    const res = await fetch(`/api/persons/${personId}/facts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'No se pudo guardar.');
      return;
    }
    setFacts((f) => [data.fact, ...f]);
    setForm({ type: 'anecdote', value: '', certainty: 'confirmed', source: '' });
  }

  async function saveEdit(id, patch) {
    const res = await fetch(`/api/facts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setFacts((f) => f.map((x) => (x.id === id ? data.fact : x)));
      setEditing(null);
    }
  }

  async function remove(id) {
    if (!confirm('¿Borrar este dato? Se oculta pero queda en el historial.')) return;
    const res = await fetch(`/api/facts/${id}`, { method: 'DELETE' });
    if (res.ok) setFacts((f) => f.filter((x) => x.id !== id));
  }

  return (
    <div>
      <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-4">
        <h3 className="text-xl font-semibold">Aportar un dato</h3>
        <div className="flex flex-wrap gap-2">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="rounded-xl border border-stone-300 px-3 py-2.5 text-lg" aria-label="Tipo de dato">
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-lg">
            <input type="checkbox" checked={form.certainty === 'unconfirmed'}
              onChange={(e) => setForm({ ...form, certainty: e.target.checked ? 'unconfirmed' : 'confirmed' })} className="h-5 w-5" />
            Sin confirmar
          </label>
        </div>
        <textarea required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
          placeholder="El dato…" rows={2} className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg" />
        <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
          placeholder="Fuente: me lo contó…, acta de…" className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg" />
        <button className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white">Guardar dato</button>
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-lg text-red-900">{error}</p>}
      </form>

      <div className="mt-4 flex flex-col gap-2">
        {facts.length === 0 && <p className="text-lg text-stone-500">Sin datos todavía.</p>}
        {facts.map((f) => (
          <div key={f.id} className="rounded-xl border border-stone-200 px-4 py-3">
            {editing === f.id ? (
              <EditFact initial={f} onSave={(patch) => saveEdit(f.id, patch)} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <p className="text-lg"><span className="font-semibold">{factTypeEs(f.type)}:</span> {f.value}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {f.certainty === 'confirmed' ? 'Confirmado' : 'Sin confirmar'}{f.source ? ` · ${f.source}` : ''}
                </p>
                <div className="mt-2 flex gap-3 text-base">
                  <button onClick={() => setEditing(f.id)} className="text-stone-600 underline">Editar</button>
                  <button onClick={() => remove(f.id)} className="text-red-800 underline">Borrar</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditFact({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial.value);
  const [source, setSource] = useState(initial.source ?? '');
  return (
    <div className="flex flex-col gap-2">
      <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2}
        className="rounded-xl border border-stone-300 px-3 py-2 text-lg" />
      <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Fuente"
        className="rounded-xl border border-stone-300 px-3 py-2 text-lg" />
      <div className="flex gap-2">
        <button onClick={() => onSave({ value, source })} className="rounded-xl bg-emerald-700 px-4 py-2 text-lg text-white">Guardar</button>
        <button onClick={onCancel} className="rounded-xl border border-stone-300 px-4 py-2 text-lg">Cancelar</button>
      </div>
    </div>
  );
}
