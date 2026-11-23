import type { Route } from './+types/judgeEvents';
import { resolveToken } from '~/lib/access.server';
import { createEventStream } from '~/lib/events.server';

export async function loader({ request, params: { token } }: Route.LoaderArgs) {
  const link = await resolveToken(token, 'JUDGE');
  if (!link) throw new Response(null, { status: 404 });
  return createEventStream(request, link.competitionId, {
    isAllowed: async () => Boolean(await resolveToken(token, 'JUDGE')),
  });
}
