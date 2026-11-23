import { redirect } from 'react-router';
import type { Route } from './+types/index';
import { userContext } from '~/context';

export function loader({ context }: Route.LoaderArgs) {
  return redirect(context.get(userContext) ? '/home' : '/login');
}
