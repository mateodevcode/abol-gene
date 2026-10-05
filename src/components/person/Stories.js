'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/format';

/**
 * Historias firmadas de la persona: leer, aportar, editar y borrar,
 * con menciones a otras personas.
 */
export default function Stories({ personId, initialStories, initialMentions }) {
  const [stories, setStories] = useState(initialStories ?? []);
  const [mentions, setMentions] = useState(initialMentions ?? []);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', body: '', story_date: '', story_date_precision: 'year', certainty: 'confirmed' });
  const [mentionIds, setMentionIds] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [editing, setEditing] = useState(null);

  async function search(e) {
    e.preventDefault();
    const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults((await res.json()).persons ?? []);
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    const res = await fetch(`/api/persons/${personId}/stories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, mentions: mentionIds }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'No se pudo guardar.');
      return;
    }
    setStories((s) => [data.story, ...s]);
    setForm({ title: '', body: '', story_date: '', story_date_precision: 'year', certainty: 'confirmed' });
    setMentionIds([]);
  }

  async function saveEdit(id, body) {
    const res = await fetch(`/api/stories/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const data = await res.json();
      setStories((s) => s.map((x) => (x.id === id ? data.story : x)));
      setEditing(null);
    }
  }

  async function remove(id) {
    if (!confirm('¿Borrar esta historia? Se oculta pero queda en el historial.')) return;
    const res = await fetch(`/api/stories/${id}`, { method: 'DELETE' });
    if (res.ok) setStories((s) => s.filter((x) => x.id !== id));
  }

  const mentionsOf = (sid) => mentions.filter((m) => m.story_id === sid);

  return (
    <div>
      <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-4">
        <h3 className="text-xl font-semibold">Aportar una historia</h3>
        <input
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Título (opcional)" className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg"
        />
        <textarea
          required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="Emanuel: recuerdo…" rows={4}
          className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg"
        />
        <div className="flex flex-wrap items-center gap-2 text-lg">
          <input type="date" value={form.story_date} onChange={(e) => setForm({ ...form, story_date: e.target.value })}
            className="rounded-xl border border-stone-300 px-3 py-2" aria-label="Fecha del relato" />
          <select value={form.story_date_precision} onChange={(e) => setForm({ ...form, story_date_precision: e.target.value })}
            className="rounded-xl border border-stone-300 px-3 py-2" aria-label="Precisión">
            <option value="day">día exacto</option>
            <option value="month">mes</option>
            <option value="year">año</option>
            <option value="decade">década</option>
            <option value="approximate">aproximada</option>
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.certainty === 'unconfirmed'}
              onChange={(e) => setForm({ ...form, certainty: e.target.checked ? 'unconfirmed' : 'confirmed' })} className="h-5 w-5" />
            Sin confirmar
          </label>
        </div>
        <p className="text-lg">
          Menciona: {mentionIds.length > 0 ? mentionIds.length + ' persona(s)' : 'a nadie más'}
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => setMentionIds((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]))}
              className="ml-2 rounded-full border border-stone-300 px-3 py-1">+ {p.given_names}</button>
          ))}
        </p>
        <button className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white">Guardar historia</button>
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-lg text-red-900">{error}</p>}
      </form>

      <form onSubmit={search} className="mt-2 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mencionar a…"
          className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-lg" />
        <button className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg">Buscar</button>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        {stories.length === 0 && <p className="text-lg text-stone-500">Sin historias todavía. Sé la primera persona en aportar.</p>}
        {stories.map((s) => (
          <article key={s.id} className="rounded-xl border border-stone-200 px-4 py-3">
            {s.title && <h3 className="text-xl font-semibold">{s.title}</h3>}
            {editing === s.id ? (
              <EditBody initial={s.body} onSave={(b) => saveEdit(s.id, b)} onCancel={() => setEditing(null)} />
            ) : (
              <p className="mt-1 whitespace-pre-line text-lg leading-relaxed">{s.body}</p>
            )}
            <p className="mt-2 text-sm text-stone-500">
              {s.author_name ? `${s.author_name}: ` : 'Relato familiar · '}
              {formatDate(s.story_date, s.story_date_precision) ?? ''}
              {s.certainty === 'unconfirmed' ? ' · sin confirmar' : ''}
            </p>
            {mentionsOf(s.id).length > 0 && (
              <p className="mt-1 text-sm">
                Menciona: {mentionsOf(s.id).map((m) => (
                  <a key={m.id} href={`/persona/${m.id}`} className="text-emerald-800 underline">
                    {m.given_names} {m.paternal_surname}
                  </a>
                )).reduce((acc, el, i) => (i === 0 ? [el] : [...acc, ', ', el]), [])}
              </p>
            )}
            <div className="mt-2 flex gap-3 text-base">
              <button onClick={() => setEditing(s.id)} className="text-stone-600 underline">Editar</button>
              <button onClick={() => remove(s.id)} className="text-red-800 underline">Borrar</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function EditBody({ initial, onSave, onCancel }) {
  const [body, setBody] = useState(initial);
  return (
    <div className="mt-1 flex flex-col gap-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
        className="rounded-xl border border-stone-300 px-3 py-2 text-lg" />
      <div className="flex gap-2">
        <button onClick={() => onSave(body)} className="rounded-xl bg-emerald-700 px-4 py-2 text-lg text-white">Guardar</button>
        <button onClick={onCancel} className="rounded-xl border border-stone-300 px-4 py-2 text-lg">Cancelar</button>
      </div>
    </div>
  );
}
