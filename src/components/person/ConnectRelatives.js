'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fullName } from '@/lib/format';

const LINK_KINDS = [
  ['biological', 'Biológico'], ['adoptive', 'Adoptivo'],
  ['foster', 'Crianza'], ['step', 'Hijastro'],
];
const UNION_KINDS = [
  ['marriage', 'Matrimonio'], ['free_union', 'Unión libre'], ['partnership', 'Pareja'],
  ['separated', 'Separados (tuvieron hijos)'],
];

/**
 * Conecta personas que YA existen como parientes: padres, pareja o hijos,
 * más adoptar rama. Todo con enlaces simples (buscar → elegir → unir).
 */
export default function ConnectRelatives({ personId, personName, branchOptions = [] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [mode, setMode] = useState('parent'); // parent | partner | child
  const [kind, setKind] = useState('biological');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function search(e) {
    e.preventDefault();
    setError('');
    setDone('');
    const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults((await res.json()).persons ?? []);
  }

  async function connect(other) {
    setBusy(true);
    setError('');
    setDone('');
    try {
      let res;
      if (mode === 'parent') {
        res = await fetch(`/api/persons/${personId}/parents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: other.id, kind, certainty: 'confirmed' }),
        });
      } else if (mode === 'partner') {
        const unionKind = kind === 'biological' ? 'marriage' : kind;
        res = await fetch('/api/unions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_a_id: personId, person_b_id: other.id, kind: UNION_KINDS.some(([v]) => v === unionKind) ? unionKind : 'marriage' }),
        });
      } else {
        res = await fetch(`/api/persons/${other.id}/parents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: personId, kind, certainty: 'confirmed' }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo conectar.');
      setDone(`${fullName(other)} conectado.`);
      setResults((rs) => rs.filter((r) => r.id !== other.id));
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function adoptBranch(id) {
    setError('');
    const res = await fetch(`/api/persons/${personId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'No se pudo asignar la rama.');
      return;
    }
    setDone('Rama asignada.');
    router.refresh();
  }

  const kinds = mode === 'partner' ? UNION_KINDS : LINK_KINDS;
  const modeLabel = mode === 'parent' ? 'padre o madre' : mode === 'partner' ? 'pareja' : 'hijo o hija';

  return (
    <div id="conectar" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de parentesco">
        {[
          ['parent', 'Padre/madre'], ['partner', 'Pareja'], ['child', 'Hijo/a'],
        ].map(([v, l]) => (
          <button
            key={v} type="button" role="tab" aria-selected={mode === v}
            onClick={() => { setMode(v); setKind(v === 'partner' ? 'marriage' : 'biological'); setResults([]); setDone(''); }}
            className={`rounded-full px-4 py-2 text-lg font-semibold ${mode === v ? 'bg-emerald-700 text-white' : 'border border-stone-300'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar ${modeLabel} existente…`}
          className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-lg"
        />
        <button className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg">Buscar</button>
      </form>
      <label className="flex items-center gap-2 text-lg">
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border border-stone-300 px-3 py-2">
          {kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {results.filter((r) => r.id !== personId).slice(0, 6).map((p) => (
        <button
          key={p.id} type="button" disabled={busy} onClick={() => connect(p)}
          className="rounded-xl border border-stone-200 px-4 py-3 text-left text-lg hover:bg-stone-50 disabled:opacity-50"
        >
          + Unir con <span className="font-semibold">{fullName(p)}</span>
          {p.birth_date ? <span className="text-stone-500"> · {String(p.birth_date).slice(0, 4)}</span> : null}
        </button>
      ))}
      <p className="text-lg">
        ¿No existe todavía?{' '}
        <a href={`/persona/nueva?progenitor=${personId}`} className="font-semibold text-emerald-800 underline">
          Crear {mode === 'child' ? 'hijo nuevo' : 'persona nueva'}
        </a>
      </p>
      {branchOptions.length > 0 && (
        <div className="rounded-xl bg-stone-50 p-3 text-lg">
          <p className="font-medium">{personName} no tiene rama. Usar la de su familia:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {branchOptions.map((b) => (
              <button key={b.id} type="button" onClick={() => adoptBranch(b.id)}
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5">
                <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {done && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-lg text-emerald-900">{done}</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}
    </div>
  );
}
