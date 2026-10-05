'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PRECS = [
  ['day', 'día exacto'], ['month', 'mes'], ['year', 'año'],
  ['decade', 'década'], ['approximate', 'aproximada'],
];

const asDate = (v) => (v ? String(v).slice(0, 10) : '');

/** Edita todos los datos de la persona (rectificar o completar). */
export default function EditPersonForm({ person, branches, onDone }) {
  const router = useRouter();
  const [form, setForm] = useState({
    given_names: person.given_names ?? '',
    paternal_surname: person.paternal_surname ?? '',
    maternal_surname: person.maternal_surname ?? '',
    nickname: person.nickname ?? '',
    birth_surname: person.birth_surname ?? '',
    gender: person.gender ?? '',
    birth_date: asDate(person.birth_date),
    birth_date_precision: person.birth_date_precision ?? 'day',
    birth_place: person.birth_place ?? '',
    death_date: asDate(person.death_date),
    death_date_precision: person.death_date_precision ?? 'day',
    death_place: person.death_place ?? '',
    is_living: person.is_living ?? true,
    branch_id: person.branch_id ?? '',
    bio_short: person.bio_short ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...form };
    if (!body.birth_date) body.birth_date_precision = null;
    if (!body.death_date) body.death_date_precision = null;
    if (!body.branch_id) body.branch_id = null;
    if (!body.gender) body.gender = null;
    const res = await fetch(`/api/persons/${person.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'No se pudo guardar.');
      return;
    }
    onDone?.();
    router.refresh();
  }

  const input = 'rounded-xl border border-stone-300 px-4 py-2.5 text-lg w-full';
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-4">
      <h3 className="text-xl font-semibold">Editar datos</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-lg">Nombres *<input value={form.given_names} onChange={(e) => set('given_names', e.target.value)} required className={input} /></label>
        <label className="text-lg">Apodo<input value={form.nickname} onChange={(e) => set('nickname', e.target.value)} className={input} /></label>
        <label className="text-lg">Apellido paterno<input value={form.paternal_surname} onChange={(e) => set('paternal_surname', e.target.value)} className={input} /></label>
        <label className="text-lg">Apellido materno<input value={form.maternal_surname} onChange={(e) => set('maternal_surname', e.target.value)} className={input} /></label>
        <label className="text-lg">Apellido de soltera<input value={form.birth_surname} onChange={(e) => set('birth_surname', e.target.value)} className={input} /></label>
        <label className="text-lg">Sexo
          <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={input}>
            <option value="">—</option><option value="M">Hombre</option><option value="F">Mujer</option>
          </select>
        </label>
        <label className="text-lg">Nacimiento<input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} className={input} /></label>
        <label className="text-lg">Precisión
          <select value={form.birth_date_precision} onChange={(e) => set('birth_date_precision', e.target.value)} className={input}>
            {PRECS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-lg sm:col-span-2">Lugar de nacimiento<input value={form.birth_place} onChange={(e) => set('birth_place', e.target.value)} className={input} /></label>
        <label className="flex items-center gap-2 text-lg">
          <input type="checkbox" checked={form.is_living} onChange={(e) => set('is_living', e.target.checked)} className="h-6 w-6" /> Vive
        </label>
        <span />
        {!form.is_living && (
          <>
            <label className="text-lg">Fallecimiento<input type="date" value={form.death_date} onChange={(e) => set('death_date', e.target.value)} className={input} /></label>
            <label className="text-lg">Precisión
              <select value={form.death_date_precision} onChange={(e) => set('death_date_precision', e.target.value)} className={input}>
                {PRECS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="text-lg sm:col-span-2">Lugar de fallecimiento<input value={form.death_place} onChange={(e) => set('death_place', e.target.value)} className={input} /></label>
          </>
        )}
        <label className="text-lg sm:col-span-2">Rama
          <select value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)} className={input}>
            <option value="">—</option>
            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="text-lg sm:col-span-2">Notas<textarea value={form.bio_short} onChange={(e) => set('bio_short', e.target.value)} rows={2} className={input} /></label>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onDone} className="rounded-xl border border-stone-300 px-4 py-3 text-lg">Cancelar</button>
      </div>
    </form>
  );
}
