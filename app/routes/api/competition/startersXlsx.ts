import { data } from 'react-router';
import type { Route } from './+types/startersXlsx';
import { createStartersWorkbook } from '~/components/starters/startersWorkbook.server';
import { toStarterRow } from '~/components/starters/starterRow';
import { competitionContext, type Context } from '~/context';
import { listStarters } from '~/lib/starters.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';

/** Everyone, or the starters of the repeated parameter `id` in that order. */
export function loader({ request, context }: Route.LoaderArgs) {
  const { searchParams } = new URL(request.url);
  return respond(context, searchParams, searchParams.has('id'));
}

/** The same with a form, because the ids of a whole competition are too long for an address. */
export async function action({ request, context }: Route.ActionArgs) {
  requireRole(context, 'VIEWER');
  return respond(context, await request.formData(), true);
}

async function respond(context: Context, params: FormData | URLSearchParams, onlyGiven: boolean) {
  const competition = context.get(competitionContext);
  const t = getT(context);
  const contestId = params.get('contest') ?? competition.contests[0]?.id;
  if (!competition.contests.some(({ id }) => id === contestId)) throw data(null, 404);

  const starters = await listStarters(competition.id);
  const byId = new Map(starters.map((starter) => [starter.id, starter]));
  const chosen = onlyGiven
    ? params.getAll('id').flatMap((id) => byId.get(String(id)) ?? [])
    : starters;
  const rows = chosen.map((starter) => toStarterRow(starter, String(contestId)));

  return new Response(await createStartersWorkbook(rows, t), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${t('starters:title')}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
