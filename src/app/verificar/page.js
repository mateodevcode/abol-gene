import { query } from '@/lib/db/client';
import VerifyButton from '@/components/auth/VerifyButton';

/** Página pública de confirmación: abrirla NO gasta el enlace. */
export default async function VerificarPage({ searchParams }) {
  const sp = await searchParams;
  const token = String(sp?.token ?? '');
  let email = null;
  if (/^[a-f0-9]{64}$/.test(token)) {
    const { rows: [t] } = await query(
      'SELECT identifier, expires FROM verification_tokens WHERE token=$1', [token]);
    if (t && new Date(t.expires) >= new Date()) email = t.identifier;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Árbol Genealógico Familiar</h1>
        {email ? (
          <p className="mt-2 text-lg text-stone-600">
            Hola, este enlace es para <span className="font-semibold">{email}</span>.
            Toca el botón para entrar (vale un solo clic).
          </p>
        ) : (
          <>
            <p className="mt-2 text-lg text-stone-600">
              Este enlace ya se usó o venció. Pide uno nuevo: llegan al correo y
              valen una hora.
            </p>
            <a href="/login" className="mt-4 inline-block rounded-xl bg-emerald-700 px-4 py-3 text-xl font-semibold text-white">
              Pedir otro enlace
            </a>
          </>
        )}
      </div>
      {email && <VerifyButton token={token} />}
    </main>
  );
}
