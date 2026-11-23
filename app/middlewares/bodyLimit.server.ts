import type { MiddlewareFunction } from 'react-router';

const MEGABYTE = 1024 * 1024;
const LIMIT = 1 * MEGABYTE;
const UPLOAD_LIMIT = 20 * MEGABYTE;

/** The pages that take logos and starter lists. Navigations in the browser add ".data". */
const UPLOAD_PATHS =
  /^\/competitions\/(new|[^/]+\/(settings|starters\/import))\/?(\.data|_\.data)?$/i;

/**
 * Rejects large bodies, which actions would read into memory. Node makes sure that a body is not
 * longer than its Content-Length. Browsers always send one, so bodies without are rejected.
 */
export const bodyLimitMiddleware: MiddlewareFunction<Response> = ({ request }, next) => {
  if (request.headers.has('Transfer-Encoding')) throw new Response(null, { status: 411 });

  const { pathname } = new URL(request.url);
  const limit = UPLOAD_PATHS.test(pathname) ? UPLOAD_LIMIT : LIMIT;
  if (Number(request.headers.get('Content-Length')) > limit) {
    throw new Response(null, { status: 413 });
  }
  return next();
};
