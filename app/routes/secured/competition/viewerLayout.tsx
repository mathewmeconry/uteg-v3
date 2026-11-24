import { Outlet } from 'react-router';
import type { Route } from './+types/viewerLayout';
import { viewerPageMiddleware } from '~/middlewares/competition.server';

/** Around every page the check-in may not see. */
export const middleware: Route.MiddlewareFunction[] = [viewerPageMiddleware];

// Client navigations only run middleware on the server when a matched route has a loader.
export function loader() {
  return null;
}

export default function ViewerLayout() {
  return <Outlet />;
}
