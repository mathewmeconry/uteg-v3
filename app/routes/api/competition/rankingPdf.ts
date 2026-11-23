import { data } from 'react-router';
import type { Route } from './+types/rankingPdf';
import { competitionContext, languageContext } from '~/context';
import { rankingTemplateSchema } from '~/lib/domain/rankingTemplate';
import { getRankingTemplate } from '~/lib/rankingTemplates.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { loadRankingGroup, rankingPdfResponse } from '~/pdf/ranking.server';
import { orNotFound, parseRankingGroup, readParams } from '~/pdf/request.server';
import { createSampleGroups } from '~/pdf/sample';

/**
 * `?contest=<id>&group=FEMALE:K5&group=…`, optionally `template=<id>` instead of the default one
 * and `provisional=1` to include running divisions.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const competition = context.get(competitionContext);
  const params = await readParams(request);
  const contestId = params.get('contest');
  const groups = params.getAll('group');
  if (!contestId || groups.length === 0) throw data(null, 400);

  return rankingPdfResponse({
    competition,
    groups: await loadGroups(competition.id, contestId, groups, params.get('provisional') === '1'),
    ...(await orNotFound(getRankingTemplate(competition.id, params.get('template')))),
    signal: request.signal,
    t: getT(context),
    language: context.get(languageContext),
  });
}

/**
 * A preview of unsaved options with the cover of `template`, and with the ranking `group` of
 * `contest` or sample data.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const competition = requireRole(context, 'EDITOR');
  const params = await readParams(request);
  const options = rankingTemplateSchema.safeParse(parseJson(params.get('options')));
  if (!options.success) throw data(null, 400);

  const contestId = params.get('contest');
  const group = params.get('group');
  const templateId = params.get('template');
  return rankingPdfResponse({
    competition,
    groups:
      contestId && group
        ? await loadGroups(competition.id, contestId, [group], false)
        : createSampleGroups(),
    options: options.data,
    cover: templateId
      ? (await orNotFound(getRankingTemplate(competition.id, templateId))).cover
      : [],
    signal: request.signal,
    t: getT(context),
    language: context.get(languageContext),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadGroups(
  competitionId: string,
  contestId: string,
  groups: string[],
  provisional: boolean,
) {
  const parsed = [...new Set(groups)].map(parseRankingGroup);
  return orNotFound(
    Promise.all(
      parsed.map((group) => loadRankingGroup(competitionId, contestId, { ...group, provisional })),
    ),
  );
}

function parseJson(value: string | null): unknown {
  try {
    return value === null ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
}
