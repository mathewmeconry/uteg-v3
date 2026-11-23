import { Outlet } from 'react-router';
import type { Route } from './+types/layout';
import { contestContext } from '~/context';
import { contestMiddleware } from '~/middlewares/competition.server';

export const middleware: Route.MiddlewareFunction[] = [contestMiddleware];

// Client navigations only run middleware on the server when a matched route has a loader.
export function loader({ context }: Route.LoaderArgs) {
  const { id, name, module } = context.get(contestContext);
  return { contest: { id, name, module: module.key } };
}

export default function ContestLayout() {
  return <Outlet />;
}
