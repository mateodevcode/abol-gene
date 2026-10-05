import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

/** Sesión actual (server components / route handlers). */
export function getSession() {
  return getServerSession(authOptions);
}

/** Usuario actual o null. */
export async function currentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** Exige sesión; lanza Response 401 si falta (route handlers). */
export async function requireUser() {
  const user = await currentUser();
  if (!user?.id) {
    throw new Response(JSON.stringify({ error: 'No autenticado.' }), { status: 401 });
  }
  return user;
}

/** Exige rol admin; lanza 403 si no lo tiene. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Solo administradores.' }), { status: 403 });
  }
  return user;
}
