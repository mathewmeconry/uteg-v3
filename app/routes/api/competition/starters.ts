import { data } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/starters';
import { toStarterRow } from '~/components/starters/starterRow';
import type { StarterChanges } from '~/components/starters/starterUpdates';
import { getContestOptions } from '~/lib/contestOptions.server';
import { MAX_EVENT_IDS } from '~/lib/events';
import { listStarters } from '~/lib/starters.server';
import { requirePermission } from '~/middlewares/competition.server';

// PostgreSQL rejects NUL.
const idsSchema = z.array(z.string().regex(/^\w+$/)).min(1).max(MAX_EVENT_IDS);

/** Some rows of the starters page, see starterUpdates. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { id, contests } = requirePermission(context, 'view', 'checkIn');
  const { searchParams } = new URL(request.url);
  const contest = contests.find((item) => item.id === searchParams.get('contest'));
  if (!contest) throw data(null, 404);
  const ids = idsSchema.safeParse(searchParams.getAll('id'));
  if (!ids.success) throw data(null, 400);

  const [starters, options] = await Promise.all([
    listStarters(id, ids.data),
    getContestOptions(id, contest.id),
  ]);
  return {
    starters: starters.map((starter) => toStarterRow(starter, contest.id)),
    contest: options,
  } satisfies StarterChanges;
}
