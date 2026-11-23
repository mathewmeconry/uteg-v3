import type { Route } from './+types/displayEvents';
import { resolveAccess } from '~/lib/access.server';
import { createEventStream } from '~/lib/events.server';

export async function loader({ request, params: { linkId } }: Route.LoaderArgs) {
  const link = await resolveAccess(request, linkId, 'DISPLAY');
  if (!link) throw new Response(null, { status: 403 });
  return createEventStream(request, link.competitionId, {
    isAllowed: async () => Boolean(await resolveAccess(request, linkId, 'DISPLAY')),
  });
}
