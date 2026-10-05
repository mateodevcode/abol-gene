import LoginForm from '@/components/auth/LoginForm';

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const sent = sp?.enviado === '1';
  const error = sp?.error;
  const expired = error === 'Verification';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Árbol Genealógico Familiar</h1>
        <p className="mt-2 text-lg text-stone-600">
          Ingreso sin contraseña: te enviamos un enlace a tu correo.
        </p>
      </div>
      {sent && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-lg text-emerald-900">
          Revisa tu correo (en local, el enlace aparece en la terminal del servidor).
        </p>
      )}
      {expired && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-lg text-amber-900">
          Ese enlace ya se usó o venció (vale 15 minutos y un solo clic; a veces el
          antivirus lo abre antes). Pide uno nuevo abajo.
        </p>
      )}
      {error && !expired && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-900">
          Hubo un problema con el ingreso. Pide un enlace nuevo.
        </p>
      )}
      <LoginForm inviteCode={sp?.code ?? ''} />
      {process.env.NODE_ENV !== 'production' && (
        <p className="text-center text-lg">
          <a href="/dev-login" className="text-emerald-800 underline">Entrada rápida de desarrollo</a>
        </p>
      )}
    </main>
  );
}
