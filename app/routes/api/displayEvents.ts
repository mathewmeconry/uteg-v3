import type { Route } from './+types/displayEvents';
import { resolveToken } from '~/lib/access.server';
import { createEventStream } from '~/lib/events.server';

export async function loader({ request, params: { token } }: Route.LoaderArgs) {
  const link = await resolveToken(token, 'DISPLAY');
  if (!link) throw new Response(null, { status: 404 });
  return createEventStream(request, link.competitionId, {
    isAllowed: async () => Boolean(await resolveToken(token, 'DISPLAY')),
  });
}
