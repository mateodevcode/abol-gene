'use client';

import { useEffect, useState } from 'react';

/** Genera enlaces de invitación y lista su estado (admin). */
export default function InviteManager() {
  const [invites, setInvites] = useState([]);
  const [days, setDays] = useState(30);
  const [target, setTarget] = useState('');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/invites');
    if (res.ok) {
      const data = await res.json();
      setInvites(data.invites ?? []);
    }
  }
  useEffect(() => {
    let alive = true;
    fetch('/api/invites')
      .then((res) => (res.ok ? res.json() : { invites: [] }))
      .then((data) => { if (alive) setInvites(data.invites ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    setCreated(null);
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_person_id: target.trim() || null,
        expires_in_days: Number(days) || 30,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'No se pudo crear.');
      return;
    }
    setCreated(data.url);
    setTarget('');
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={create} className="flex flex-col gap-4 rounded-2xl border border-stone-200 p-6">
        <h2 className="text-2xl font-semibold">Nueva invitación</h2>
        <label className="flex flex-col gap-1 text-lg">
          ID de la persona del árbol <span className="text-sm text-stone-500">(opcional; en Fase 5 habrá buscador)</span>
          <input
            value={target} onChange={(e) => setTarget(e.target.value)}
            placeholder="uuid de la persona (opcional)"
            className="rounded-xl border border-stone-300 px-4 py-3 text-lg"
          />
        </label>
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
          <p className="break-all rounded-xl bg-emerald-50 px-4 py-3 text-lg">
            Comparte este enlace: <span className="font-mono">{created}</span>
          </p>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}
      </form>

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">Invitaciones</h2>
        {invites.map((i) => (
          <div key={i.id} className="rounded-xl border border-stone-200 px-4 py-3 text-lg">
            <span className="font-mono">{i.code}</span>
            {' · '}{i.target_name?.trim() ? `para ${i.target_name}` : 'abierta'}
            {' · '}{i.used_at ? `usada ✓` : i.expires_at && new Date(i.expires_at) < new Date() ? 'vencida' : 'vigente'}
          </div>
        ))}
        {invites.length === 0 && <p className="text-lg text-stone-500">Aún no hay invitaciones.</p>}
      </div>
    </div>
  );
}
