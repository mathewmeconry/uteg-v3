import { createElement } from 'react';
import { data } from 'react-router';
import type { Route } from './+types/judgingSheetsPdf';
import { competitionContext, languageContext, type Context } from '~/context';
import { getGradingState } from '~/lib/judging.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { JudgingSheetsDocument } from '~/pdf/JudgingSheetsDocument';
import { pdfResponse } from '~/pdf/pdf.server';
import { parseGround } from '~/pdf/request.server';

/** `?division=<id>&division=…`, or `?ground=1&ground=…` for the divisions running there. */
export function loader({ request, context }: Route.LoaderArgs) {
  return judgingSheetsPdf(context, new URL(request.url).searchParams);
}

/** The same as a form, for many divisions. */
export async function action({ request, context }: Route.ActionArgs) {
  requireRole(context, 'VIEWER');
  return judgingSheetsPdf(context, await request.formData());
}

async function judgingSheetsPdf(context: Context, params: URLSearchParams | FormData) {
  const competition = context.get(competitionContext);
  const t = getT(context);
  const divisionIds = [...new Set(params.getAll('division').map(String))];
  const grounds = [...new Set(params.getAll('ground').map((value) => parseGround(String(value))))];
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
    createElement(JudgingSheetsDocument, {
      grounds: states,
      competitionName: competition.name,
      t,
      language: context.get(languageContext),
    }),
    `${t('pdf:sheets.title')} ${competition.name}`,
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
