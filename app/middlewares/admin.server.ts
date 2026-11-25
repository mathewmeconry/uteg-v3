import { data, type MiddlewareFunction } from 'react-router';
import { getUser } from '~/lib/auth/auth.server';
import { isAdmin } from '~/lib/users.server';

/** Hides the admin pages from everyone else. Needs authMiddleware before it. */
export const adminMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
  if (!(await isAdmin(getUser(context).id))) throw data(null, 404);
  return next();
};
