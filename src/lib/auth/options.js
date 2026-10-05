import Credentials from 'next-auth/providers/credentials';
import { PgAdapter } from '@/lib/auth/adapter';
import { authorizeMagicToken } from '@/lib/auth/magic-token';
import { query } from '@/lib/db/client';

const isDev = process.env.NODE_ENV !== 'production';
const adapter = PgAdapter();

/**
 * Opciones NextAuth v4: enlace mágico con CONFIRMACIÓN (a prueba de
 * antivirus que pre-abren enlaces: abrir el correo no gasta nada, solo el
 * botón "Entrar" consume el token de un solo uso vía POST).
 * Google desactivado hasta Fase 9. Sesiones JWT (el proxy corre en el edge
 * y no puede consultar Postgres; la sesión se refresca desde la DB).
 */
export const authOptions = {
  adapter,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  providers: [
    Credentials({
      id: 'magic-token',
      name: 'Enlace mágico',
      credentials: { token: { label: 'Token', type: 'text' } },
      // Solo el POST del botón consume (los antivirus no hacen POST).
      async authorize(credentials) {
        return authorizeMagicToken(credentials?.token);
      },
    }),
    // Solo desarrollo: entrada rápida sin correo (ver /dev-login).
    ...(isDev
      ? [Credentials({
        id: 'dev',
        name: 'Desarrollo',
        credentials: { email: { label: 'Correo', type: 'email' } },
        async authorize(credentials) {
          const email = String(credentials?.email ?? '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
          let { rows: [u] } = await query('SELECT * FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL', [email]);
          if (!u) {
            const first = await query('SELECT count(*)::int AS n FROM users');
            const role = first.rows[0].n === 0 ? 'admin' : 'member';
            const created = await query(
              "INSERT INTO users (email, name, role, email_verified) VALUES ($1,$2,$3,now()) RETURNING *",
              [email, email.split('@')[0], role]);
            u = created.rows[0];
          }
          return { id: u.id, name: u.name, email: u.email };
        },
      })]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const { rows: [u] } = await query('SELECT id, role, person_id FROM users WHERE id=$1 AND deleted_at IS NULL', [user.id]);
        if (u) {
          token.uid = u.id;
          token.role = u.role;
          token.person_id = u.person_id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const uid = token.uid ?? token.sub;
        session.user.id = uid;
        // Fresco desde la DB (1 query indexada): la vinculación y los
        // cambios de rol se reflejan sin reingresar. El middleware (edge)
        // solo verifica que el token exista.
        try {
          const { rows: [u] } = await query(
            'SELECT role, person_id FROM users WHERE id=$1 AND deleted_at IS NULL', [uid]);
          session.user.role = u?.role ?? token.role ?? 'member';
          session.user.person_id = u?.person_id ?? token.person_id ?? null;
        } catch {
          session.user.role = token.role ?? 'member';
          session.user.person_id = token.person_id ?? null;
        }
      }
      return session;
    },
  },
};
