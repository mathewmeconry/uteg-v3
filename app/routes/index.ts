import { redirect } from 'react-router';
import type { Route } from './+types/index';
import { languageContext, userContext } from '~/context';

export function loader({ context }: Route.LoaderArgs) {
  const target = context.get(userContext) ? '/home' : `/${context.get(languageContext)}`;
  return redirect(target, { headers: { Vary: 'Accept-Language, Cookie' } });
}
