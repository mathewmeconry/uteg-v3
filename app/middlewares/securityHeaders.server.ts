import type { MiddlewareFunction } from 'react-router';
import { APP_ORIGIN } from '~/lib/env.server';

export const securityHeadersMiddleware: MiddlewareFunction<Response> = async (
  { request },
  next,
) => {
  const response = await next();
  const { pathname } = new URL(request.url);
  const isAccessPage = /^\/(judge|display)\//i.test(pathname);

  response.headers.set(
    'Referrer-Policy',
    isAccessPage ? 'no-referrer' : 'strict-origin-when-cross-origin',
  );
  // The rest of a rejected body is not worth receiving, see bodyLimitMiddleware.
  if (response.status === 413 || response.status === 411) {
    response.headers.set('Connection', 'close');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Same origin, so pages can show a PDF preview.
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'self'",
  );
  // Only the landing page, see routes/landing.tsx, is for search engines.
  if (!/^\/((de|fr|en)\/?)?$/i.test(pathname)) response.headers.set('X-Robots-Tag', 'noindex');
  if (APP_ORIGIN.startsWith('https:')) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return response;
};
