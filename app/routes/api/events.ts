import type { Route } from './+types/events';
import { competitionContext } from '~/context';
import { getUser } from '~/lib/auth/auth.server';
import { getCompetitionForUser } from '~/lib/competitions.server';
import { createEventStream } from '~/lib/events.server';
import { authMiddleware } from '~/middlewares/auth.server';
import { competitionMiddleware } from '~/middlewares/competition.server';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware, competitionMiddleware];

export function loader({ request, context }: Route.LoaderArgs) {
  const { id } = context.get(competitionContext);
  const user = getUser(context);
  return createEventStream(request, id, {
    // Rejects when the membership was removed, which ends the stream.
    isAllowed: async () => Boolean(await getCompetitionForUser(user.id, id)),
  });
}
