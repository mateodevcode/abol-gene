'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fullName } from '@/lib/format';

const PRECS = [
  ['day', 'día exacto'], ['month', 'mes'], ['year', 'año'],
  ['decade', 'década'], ['approximate', 'aproximada'],
];

/** Formulario para agregar una persona real (con aviso de duplicados). */
export default function NewPersonForm({ progenitor = null }) {
  const router = useRouter();
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({
    given_names: '', paternal_surname: '', maternal_surname: '', nickname: '',
    gender: '', birth_date: '', birth_date_precision: 'day', birth_place: '',
    death_date: '', death_date_precision: 'day', is_living: true, branch_id: '', bio_short: '',
  });
  const [newBranch, setNewBranch] = useState('');
  const [parents, setParents] = useState([]); // [{id,...}]
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [dups, setDups] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch('/api/branches').then((r) => r.json()).then((d) => setBranches(d.branches ?? [])).catch(() => {});
  }, []);

  async function search(e) {
    e.preventDefault();
    const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults((await res.json()).persons ?? []);
  }

  async function review(e) {
    e.preventDefault();
    setError('');
    if (!form.given_names.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    const sp = new URLSearchParams({
      given_names: form.given_names, paternal_surname: form.paternal_surname,
      maternal_surname: form.maternal_surname, birth_date: form.birth_date,
      parent_ids: parents.map((p) => p.id).join(','),
    });
    const res = await fetch(`/api/persons/duplicates?${sp}`);
    setDups(res.ok ? (await res.json()).duplicates ?? [] : []);
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      let branchId = form.branch_id || null;
      if (!branchId && newBranch.trim()) {
        const rb = await fetch('/api/branches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newBranch.trim() }),
        });
        const db = await rb.json();
        if (!rb.ok) throw new Error(db.error ?? 'No se pudo crear la rama.');
        branchId = db.branch.id;
      }
      const body = { ...form, branch_id: branchId, gender: form.gender || null };
      for (const k of ['paternal_surname', 'maternal_surname', 'nickname', 'birth_date', 'birth_place', 'death_date', 'bio_short']) {
        if (!body[k]) body[k] = null;
      }
      if (!body.birth_date) body.birth_date_precision = null;
      if (!body.death_date) body.death_date_precision = null;
      const res = await fetch('/api/persons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear.');
      for (const p of parents) {
        await fetch(`/api/persons/${data.person.id}/parents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: p.id, kind: 'biological', certainty: 'confirmed' }),
        });
      }
      if (progenitor?.id) {
        // La persona creada es padre/madre del hijo ya elegido.
        const rl = await fetch(`/api/persons/${progenitor.id}/parents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: data.person.id, kind: 'biological', certainty: 'confirmed' }),
        });
        if (!rl.ok) {
          const dl = await rl.json().catch(() => ({}));
          throw new Error(`Persona creada, pero no se pudo vincular: ${dl.error ?? 'revisa las fechas'}. Búscala en su ficha.`);
        }
      }
      router.push(`/persona/${data.person.id}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const input = 'rounded-xl border border-stone-300 px-4 py-2.5 text-lg w-full';
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-lg">Nombres *<input value={form.given_names} onChange={(e) => set('given_names', e.target.value)} className={input} placeholder="José María" /></label>
        <label className="text-lg">Apodo<input value={form.nickname} onChange={(e) => set('nickname', e.target.value)} className={input} placeholder="Chepe" /></label>
        <label className="text-lg">Apellido paterno<input value={form.paternal_surname} onChange={(e) => set('paternal_surname', e.target.value)} className={input} /></label>
        <label className="text-lg">Apellido materno<input value={form.maternal_surname} onChange={(e) => set('maternal_surname', e.target.value)} className={input} /></label>
        <label className="text-lg">Sexo
          <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={input}>
            <option value="">—</option><option value="M">Hombre</option><option value="F">Mujer</option>
          </select>
        </label>
        <label className="flex items-end gap-2 text-lg pb-2">
          <input type="checkbox" checked={form.is_living} onChange={(e) => set('is_living', e.target.checked)} className="h-6 w-6" /> Vive
        </label>
        <label className="text-lg">Nacimiento<input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} className={input} /></label>
        <label className="text-lg">Precisión
          <select value={form.birth_date_precision} onChange={(e) => set('birth_date_precision', e.target.value)} className={input}>
            {PRECS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {!form.is_living && (
          <>
            <label className="text-lg">Fallecimiento<input type="date" value={form.death_date} onChange={(e) => set('death_date', e.target.value)} className={input} /></label>
            <label className="text-lg">Precisión
              <select value={form.death_date_precision} onChange={(e) => set('death_date_precision', e.target.value)} className={input}>
                {PRECS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="text-lg sm:col-span-2">Rama
          <select value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)} className={input}>
            <option value="">—</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.person_count})</option>)}
          </select>
        </label>
        {!form.branch_id && (
          <label className="text-lg sm:col-span-2">…o crea una rama<input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} className={input} placeholder="Familia paterna" /></label>
        )}
        <label className="text-lg sm:col-span-2">Notas<textarea value={form.bio_short} onChange={(e) => set('bio_short', e.target.value)} rows={2} className={input} /></label>
      </div>

      <div className="rounded-2xl border border-stone-200 p-4">
        <h3 className="text-xl font-semibold">Padres (opcional)</h3>
        <p className="mt-1 text-base text-stone-600">Seleccionados: {parents.length === 0 ? 'nadie todavía' : parents.map((p) => fullName(p)).join(' y ')}</p>
        <form onSubmit={search} className="mt-2 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar padre/madre…" className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-lg" />
          <button className="rounded-xl border border-stone-300 px-4 py-2 text-lg">Buscar</button>
        </form>
        {results.filter((r) => !parents.some((p) => p.id === r.id)).slice(0, 5).map((p) => (
          <button key={p.id} type="button" disabled={parents.length >= 2}
            onClick={() => setParents((ps) => [...ps, p])}
            className="mr-2 mt-2 rounded-full border border-stone-300 px-3 py-1 text-lg disabled:opacity-40">
            + {fullName(p)}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}

      {!dups ? (
        <button onClick={review} className="rounded-xl bg-stone-800 px-4 py-3 text-xl font-semibold text-white">
          Revisar duplicados
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {dups.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-lg">Sin parecidos. Puedes crear.</p>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-lg font-semibold">¿Es alguna de estas personas?</p>
              {dups.map((d) => (
                <a key={d.person.id} href={`/persona/${d.person.id}`} className="mt-1 block text-lg text-emerald-900 underline">
                  {fullName(d.person)} ({Math.round(d.score * 100)}% · {d.reasons.join(', ')})
                </a>
              ))}
            </div>
          )}
          <button onClick={create} disabled={busy} className="rounded-xl bg-emerald-700 px-4 py-3 text-xl font-semibold text-white disabled:opacity-50">
            {busy ? 'Creando…' : 'Crear persona'}
          </button>
          <button onClick={() => setDups(null)} className="text-lg text-stone-600 underline">Volver a editar</button>
        </div>
      )}
    </div>
  );
}
