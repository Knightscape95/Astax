import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // If user is authenticated, allow access
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
);

// Protect all routes except login, auth API, static files, and PWA assets
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login (login page)
     * - /api/auth (NextAuth API routes)
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /favicon.ico (favicon file)
     * - /icons (PWA icons)
     * - /manifest.json (PWA manifest)
     * - /sw.js (service worker)
     * - /workbox-*.js (workbox files)
     */
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-).*)',
  ],
};
