import { notFound } from 'next/navigation';
import DevLoginForm from '@/components/auth/DevLoginForm';

export default function DevLoginPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Entrada de desarrollo</h1>
        <p className="mt-2 text-lg text-stone-600">
          Crea tu usuario de prueba al instante, sin correo. Esta página no existe en producción.
        </p>
      </div>
      <DevLoginForm />
    </main>
  );
}
