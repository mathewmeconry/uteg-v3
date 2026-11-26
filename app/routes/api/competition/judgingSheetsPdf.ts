import { data } from 'react-router';
import type { Route } from './+types/judgingSheetsPdf';
import { competitionContext, type Context } from '~/context';
import { Role } from '~/generated/prisma/enums';
import { getGradingState } from '~/lib/judging.server';
import { requireRoleOr } from '~/middlewares/competition.server';
import { getDocumentI18n } from '~/middlewares/i18n.server';
import { parseGround, readParams } from '~/pdf/request.server';
import { pdfResponse } from '~/pdf/response.server';

/** `?division=<id>&division=…`, or `?ground=1&ground=…` for the divisions running there. */
export function loader({ request, context }: Route.LoaderArgs) {
  return judgingSheetsPdf(request, context);
}

/** The same as a form, for many divisions. */
export function action({ request, context }: Route.ActionArgs) {
  requireRoleOr(context, Role.VIEWER, Role.GRADE_ENTRY);
  return judgingSheetsPdf(request, context);
}

async function judgingSheetsPdf(request: Request, context: Context) {
  const competition = context.get(competitionContext);
  const { language, t } = getDocumentI18n(request, context);
  const params = await readParams(request);
  const divisionIds = [...new Set(params.getAll('division'))];
  const grounds = [...new Set(params.getAll('ground').map(parseGround))];
  if (divisionIds.length === 0 && grounds.length === 0) throw data(null, 400);
  if (grounds.some((ground) => ground > competition.grounds)) throw data(null, 404);

  const states = await Promise.all([
    ...(await groupByGround(competition.id, divisionIds)),
    ...grounds.map(async (ground) => ({
      ground,
      ...(await getGradingState(competition.id, { ground })),
    })),
  ]);
  return pdfResponse(
    {
      type: 'judgingSheets',
      language,
      props: { grounds: states, competitionName: competition.name },
    },
    { name: `${t('pdf:sheets.title')} ${competition.name}`, signal: request.signal, t },
  );
}

/** Only divisions on the same ground are judged as one list. */
async function groupByGround(competitionId: string, divisionIds: string[]) {
  if (divisionIds.length === 0) return [];
  const { divisions } = await getGradingState(competitionId, { divisionIds });
  if (divisions.length !== divisionIds.length) throw data(null, 404);
  return [...Map.groupBy(divisions, ({ ground }) => ground)]
    .toSorted(([a], [b]) => a - b)
    .map(async ([ground, members]) => ({
      ground,
      ...(await getGradingState(competitionId, { divisionIds: members.map(({ id }) => id) })),
    }));
}
