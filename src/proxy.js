import { withAuth } from 'next-auth/middleware';

const PUBLIC = [/^\/login/, /^\/join(\/|$)/, /^\/verificar/, /^\/dev-login/, /^\/api\/auth(\/|$)/, /^\/favicon\.ico/];
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Todo exige sesión salvo canje de invitación y login.
 * Sin sesión -> redirect a /login (pages.signIn).
 * (Next 16: convención `proxy`, antes `middleware`.)
 */
export default withAuth({
  pages: { signIn: '/login' },
  callbacks: {
    authorized: ({ token, req }) => {
      const { pathname } = req.nextUrl;
      if (pathname === '/') return true; // el redirect se hace en la página
      if (PUBLIC.some((re) => re.test(pathname))) {
        if (pathname.startsWith('/dev-login') && !isDev) return !!token;
        return true;
      }
      // APIs: el proxy deja pasar y cada handler exige sesión (401 JSON).
      // Solo /api/auth/* y la vista previa de invitación son públicas.
      if (pathname.startsWith('/api/')) return true;
      return !!token;
    },
  },
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.png$|.*\\.ico$|.*\\.svg$).*)'],
};
