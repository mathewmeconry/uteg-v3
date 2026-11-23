import type { Route } from './+types/displayLogin';
import { logIn } from '~/lib/access.server';

export function action({ request, params: { linkId } }: Route.ActionArgs) {
  return logIn(request, linkId, 'DISPLAY');
}
