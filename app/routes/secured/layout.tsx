import { Outlet } from 'react-router';
import type { Route } from './+types/layout';
import { getUser } from '~/lib/auth/auth.server';
import { authMiddleware } from '~/middlewares/auth.server';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

// Client navigations only run middleware on the server when a matched route has a loader.
export function loader({ context }: Route.LoaderArgs) {
  return { email: getUser(context).email };
}

export default function SecuredLayout() {
  return <Outlet />;
}
