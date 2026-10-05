'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

/** Solo desarrollo (el proveedor `dev` no existe en producción). */
export default function DevLoginForm() {
  const [email, setEmail] = useState('prueba@familia.local');

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); signIn('dev', { email, callbackUrl: '/arbol' }); }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1 text-lg">
        Correo de prueba
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-stone-300 px-4 py-3 text-lg"
        />
      </label>
      <button className="rounded-xl bg-emerald-700 px-4 py-3 text-xl font-semibold text-white">
        Entrar sin correo
      </button>
    </form>
  );
}
