'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Botón Deshacer de una entrada del historial. */
export default function UndoButton({ changeId, disabledReason = null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function undo() {
    if (!confirm('¿Deshacer este cambio?')) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/history/${changeId}/undo`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'No se pudo deshacer.');
      return;
    }
    router.refresh();
  }

  if (disabledReason) return <span className="text-base text-stone-400">{disabledReason}</span>;
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        onClick={undo} disabled={busy}
        className="rounded-xl border border-stone-300 px-3 py-1.5 text-base font-semibold disabled:opacity-50"
      >
        {busy ? '…' : 'Deshacer'}
      </button>
      {error && <span className="text-sm text-red-800">{error}</span>}
    </span>
  );
}
