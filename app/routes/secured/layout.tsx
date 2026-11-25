import { Outlet } from 'react-router';
import type { Route } from './+types/layout';
import { getUser } from '~/lib/auth/auth.server';
import { isAdmin } from '~/lib/users.server';
import { authMiddleware } from '~/middlewares/auth.server';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

// Client navigations only run middleware on the server when a matched route has a loader.
export async function loader({ context }: Route.LoaderArgs) {
  const { id, email } = getUser(context);
  return { email, isAdmin: await isAdmin(id) };
}

export default function SecuredLayout() {
  return <Outlet />;
}
