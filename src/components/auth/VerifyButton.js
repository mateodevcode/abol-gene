'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

/** El único clic que consume el enlace (POST, los antivirus no lo tocan). */
export default function VerifyButton({ token }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function enter() {
    setBusy(true);
    setError('');
    const res = await signIn('magic-token', { token, callbackUrl: '/bienvenida', redirect: false });
    if (res?.error) {
      setError('Este enlace ya se usó o venció. Pide uno nuevo en /login.');
      setBusy(false);
      return;
    }
    window.location.href = res?.url ?? '/bienvenida';
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={enter} disabled={busy}
        className="rounded-xl bg-emerald-700 px-4 py-4 text-2xl font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Entrando…' : 'Entrar al árbol'}
      </button>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">{error}</p>}
    </div>
  );
}
