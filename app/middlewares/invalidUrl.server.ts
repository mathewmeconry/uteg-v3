import type { MiddlewareFunction } from 'react-router';

/** PostgreSQL rejects NUL, so no record can be at an address that contains it. */
export const invalidUrlMiddleware: MiddlewareFunction<Response> = ({ request }, next) => {
  if (request.url.includes('%00')) throw new Response(null, { status: 404 });
  return next();
};
