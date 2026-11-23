import type { MiddlewareFunction } from 'react-router';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** Rejects mutations that other sites trigger. */
export function originMiddleware(appOrigin: string): MiddlewareFunction<Response> {
  return ({ request }, next) => {
    if (SAFE_METHODS.includes(request.method)) return next();

    const origin = request.headers.get('Origin');
    if (origin === appOrigin) return next();
    // Forms on pages with Referrer-Policy: no-referrer send "Origin: null". Browsers don't let
    // pages set Sec-Fetch-Site.
    const unknownOrigin = origin === null || origin === 'null';
    if (unknownOrigin && request.headers.get('Sec-Fetch-Site') === 'same-origin') return next();

    throw new Response('Cross-origin request', { status: 403 });
  };
}
