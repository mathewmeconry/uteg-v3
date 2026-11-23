import type { MiddlewareFunction } from 'react-router';
import { APP_ORIGIN } from '~/lib/env.server';

export const securityHeadersMiddleware: MiddlewareFunction<Response> = async (
  { request },
  next,
) => {
  const response = await next();
  const { pathname } = new URL(request.url);
  // The URLs of judges and displays contain their token.
  const hasToken = /^\/(api\/)?(judge|display)\//.test(pathname);

  response.headers.set(
    'Referrer-Policy',
    hasToken ? 'no-referrer' : 'strict-origin-when-cross-origin',
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Same origin, so pages can show a PDF preview.
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'self'",
  );
  response.headers.set('X-Robots-Tag', 'noindex');
  if (APP_ORIGIN.startsWith('https:')) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return response;
};
