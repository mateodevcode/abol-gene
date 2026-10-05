'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PersonLink from '@/components/person/PersonLink';

/** Pantalla admin: rastrear, fusionar o descartar duplicados. */
export default function DuplicateManager({ initial }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initial ?? []);
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState('');
  const [keep, setKeep] = useState({}); // candidateId -> personId
  const [busy, setBusy] = useState(null);

  async function scan() {
    setScanning(true);
    setScanInfo('');
    const res = await fetch('/api/duplicates', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setScanning(false);
    if (!res.ok) {
      setScanInfo(data.error ?? 'Error al rastrear.');
      return;
    }
    setScanInfo(`Revisados ${data.scanned} pares, ${data.inserted} nuevos candidatos.`);
    const list = await fetch('/api/duplicates').then((r) => r.json());
    setCandidates(list.candidates ?? []);
  }

  async function merge(c) {
    if (!confirm(`¿Fusionar en ${keep[c.id] === c.b.id ? 'B' : 'A'}? La otra persona se oculta (se puede deshacer).`)) return;
    setBusy(c.id);
    const res = await fetch(`/api/duplicates/${c.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep_id: keep[c.id] ?? c.a.id }),
    });
    setBusy(null);
    if (res.ok) {
      setCandidates((cs) => cs.filter((x) => x.id !== c.id));
      router.refresh();
    }
  }

  async function dismiss(c) {
    const res = await fetch(`/api/duplicates/${c.id}`, { method: 'DELETE' });
    if (res.ok) setCandidates((cs) => cs.filter((x) => x.id !== c.id));
  }

  return (
    <div>
      <button
        onClick={scan} disabled={scanning}
        className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50"
      >
        {scanning ? 'Rastreando…' : 'Rastrear duplicados'}
      </button>
      {scanInfo && <p className="mt-2 text-lg text-stone-600">{scanInfo}</p>}

      <div className="mt-6 flex flex-col gap-4">
        {candidates.length === 0 && <p className="text-lg text-stone-500">Sin candidatos pendientes.</p>}
        {candidates.map((c) => (
          <div key={c.id} className="rounded-2xl border border-stone-200 p-4">
            <p className="text-lg font-semibold">Parecido {(c.score * 100).toFixed(0)}%</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-xl border border-stone-200 p-2">
                <input
                  type="radio" name={`keep-${c.id}`} checked={(keep[c.id] ?? c.a.id) === c.a.id}
                  onChange={() => setKeep((k) => ({ ...k, [c.id]: c.a.id }))} className="mt-2 h-5 w-5"
                />
                <span className="flex-1"><PersonLink person={c.a} sub={`Conservar · n. ${c.a.birth_date ?? '?'}`} /></span>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-stone-200 p-2">
                <input
                  type="radio" name={`keep-${c.id}`} checked={(keep[c.id] ?? c.a.id) === c.b.id}
                  onChange={() => setKeep((k) => ({ ...k, [c.id]: c.b.id }))} className="mt-2 h-5 w-5"
                />
                <span className="flex-1"><PersonLink person={c.b} sub={`Conservar · n. ${c.b.birth_date ?? '?'}`} /></span>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => merge(c)} disabled={busy === c.id}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-lg font-semibold text-white disabled:opacity-50"
              >
                Fusionar
              </button>
              <button onClick={() => dismiss(c)} className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg">
                No son duplicados
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
