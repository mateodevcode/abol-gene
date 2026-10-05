'use client';

import { useState } from 'react';
import { requestMagicLink } from '@/lib/auth/magic';

/** Formulario de ingreso con enlace mágico (opcionalmente con invitación). */
export default function LoginForm({ inviteCode = '' }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(inviteCode);
  const [status, setStatus] = useState(null); // { ok, message }

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ ok: null, message: 'Enviando…' });
    const res = await requestMagicLink(email, code || null);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error });
    } else {
      setStatus({
        ok: true,
        message: 'Listo. Revisa tu correo y toca "Entrar al árbol" (abrir el correo no gasta el enlace).',
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-lg">
        Correo electrónico
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="tia@ejemplo.com" autoComplete="email"
          className="rounded-xl border border-stone-300 px-4 py-3 text-lg"
        />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        Código de invitación <span className="text-sm text-stone-500">(solo la primera vez)</span>
        <input
          value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="Opcional si ya tienes cuenta"
          className="rounded-xl border border-stone-300 px-4 py-3 text-lg"
        />
      </label>
      <button
        type="submit"
        className="rounded-xl bg-emerald-700 px-4 py-3 text-xl font-semibold text-white hover:bg-emerald-800"
      >
        Enviarme el enlace de ingreso
      </button>
      {status && (
        <p className={`rounded-xl px-4 py-3 text-lg ${status.ok ? 'bg-emerald-50 text-emerald-900' : status.ok === false ? 'bg-red-50 text-red-900' : 'bg-stone-100'}`}>
          {status.message}
        </p>
      )}
    </form>
  );
}
