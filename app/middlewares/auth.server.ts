import { redirect, type MiddlewareFunction } from 'react-router';
import { userContext } from '~/context';
import { auth, authCookies } from '~/lib/auth/auth.server';
import { pagePath } from '~/lib/auth/redirect';

/** Loads the session, if there is one, and passes on refreshed session cookies. */
export const sessionMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  if (!request.headers.has('Cookie')) return next();

  const session = await auth.api.getSession({ headers: request.headers, returnHeaders: true });
  context.set(userContext, session.response?.user ?? null);

  const response = await next();
  for (const cookie of authCookies(session).getSetCookie()) {
    const name = cookie.slice(0, cookie.indexOf('=') + 1);
    // Signing in or out during the request wins.
    if (response.headers.getSetCookie().some((own) => own.startsWith(name))) continue;
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
};

/** Sends visitors without a session to the login page. */
export const authMiddleware: MiddlewareFunction<Response> = ({ request, context }, next) => {
  if (context.get(userContext)) return next();
  // EventSource and fetch can't use a login page.
  if (request.headers.get('Accept')?.includes('text/event-stream')) {
    throw new Response(null, { status: 401 });
  }
  const target = request.method === 'GET' ? pagePath(request.url) : '/home';
  throw redirect(`/login?redirectTo=${encodeURIComponent(target)}`);
};
