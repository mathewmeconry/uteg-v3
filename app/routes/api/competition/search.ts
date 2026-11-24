import type { Route } from './+types/search';
import { competitionContext } from '~/context';
import { getSearchIndex } from '~/lib/searchIndex.server';

export async function loader({ context }: Route.LoaderArgs) {
  return getSearchIndex(context.get(competitionContext).id);
}
