'use client';

import { useEffect, useState } from 'react';
import { fullName } from '@/lib/format';

/** Genera enlaces de invitación y lista su estado (admin). */
export default function InviteManager() {
  const [invites, setInvites] = useState([]);
  const [days, setDays] = useState(30);
  const [target, setTarget] = useState(null); // persona elegida o null (abierta)
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [created, setCreated] = useState(null); // { url, code }
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/invites');
    if (res.ok) setInvites((await res.json()).invites ?? []);
  }
  useEffect(() => {
    let alive = true;
    fetch('/api/invites')
      .then((res) => (res.ok ? res.json() : { invites: [] }))
      .then((data) => { if (alive) setInvites(data.invites ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function search(e) {
    e.preventDefault();
    const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults((await res.json()).persons ?? []);
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    setCreated(null);
    setCopied(false);
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_person_id: target?.id ?? null,
        expires_in_days: Number(days) || 30,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'No se pudo crear.');
      return;
    }
    setCreated({ url: data.url, code: data.invite.code });
    setTarget(null);
    load();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar. Selecciónalo manual.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={create} className="flex flex-col gap-4 rounded-2xl border border-stone-200 p-6">
        <h2 className="text-2xl font-semibold">Nueva invitación</h2>
        <div className="text-lg">
          <p className="font-medium">
            Para: {target ? fullName(target) : 'quien sea (abierta)'}
            {target && (
              <button type="button" onClick={() => setTarget(null)} className="ml-3 text-stone-500 underline">
                quitar
              </button>
            )}
          </p>
          <p className="mt-1 text-base text-stone-500">Si eliges persona, al entrar queda vinculada sola.</p>
        </div>
        <label className="flex flex-col gap-1 text-lg">
          Vence en (días)
          <input
            type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)}
            className="rounded-xl border border-stone-300 px-4 py-3 text-lg"
          />
        </label>
        <button className="rounded-xl bg-emerald-700 px-4 py-3 text-xl font-semibold text-white">
          Generar enlace
        </button>
        {created && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <p className="text-lg">Código: <span className="font-mono font-bold">{created.code}</span></p>
            <p className="break-all text-lg">Enlace: <span className="font-mono">{created.url}</span></p>
            <button type="button" onClick={() => copy(`${created.url}`)}
              className="mt-2 rounded-xl bg-emerald-700 px-4 py-2 text-lg font-semibold text-white">
              {copied ? '¡Copiado!' : 'Copiar enlace'}
            </button>
          </div>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}
      </form>

      <form onSubmit={search} className="flex gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar persona para la invitación…"
          className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-lg"
        />
        <button className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg">Buscar</button>
      </form>
      {results.filter((r) => r.id !== target?.id).slice(0, 5).map((p) => (
        <button
          key={p.id} type="button" onClick={() => setTarget(p)}
          className="rounded-xl border border-stone-200 px-4 py-2 text-left text-lg hover:bg-stone-50"
        >
          Para: <span className="font-semibold">{fullName(p)}</span>
        </button>
      ))}

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">Invitaciones</h2>
        {invites.map((i) => (
          <div key={i.id} className="rounded-xl border border-stone-200 px-4 py-3 text-lg">
            <span className="font-mono font-bold">{i.code}</span>
            {' · '}{i.target_name?.trim() ? `para ${i.target_name}` : 'abierta'}
            {' · '}{i.used_at ? `usada ✓` : i.expires_at && new Date(i.expires_at) < new Date() ? 'vencida' : 'vigente'}
            {!i.used_at && (
              <button type="button" onClick={() => copy(`${window.location.origin}/join/${i.code}`)}
                className="ml-3 rounded-full border border-stone-300 px-3 py-1 text-base">
                Copiar
              </button>
            )}
          </div>
        ))}
        {invites.length === 0 && <p className="text-lg text-stone-500">Aún no hay invitaciones.</p>}
      </div>
    </div>
  );
}
