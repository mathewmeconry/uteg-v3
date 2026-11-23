import type { Route } from './+types/judgeLogin';
import { logIn } from '~/lib/access.server';

export function action({ request, params: { linkId } }: Route.ActionArgs) {
  return logIn(request, linkId, 'JUDGE');
}
