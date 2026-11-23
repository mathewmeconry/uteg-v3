import { data } from 'react-router';
import type { Route } from './+types/rankingPdf';
import { competitionContext, languageContext } from '~/context';
import { rankingTemplateSchema } from '~/lib/domain/rankingTemplate';
import { getRankingTemplate } from '~/lib/rankingTemplates.server';
import { groupByTemplate } from '~/lib/templateAssignments.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { loadRankingGroup, rankingPdfResponse } from '~/pdf/ranking.server';
import { orNotFound, parseRankingGroup, readParams } from '~/pdf/request.server';
import { createSampleGroups } from '~/pdf/sample';

/**
 * `?contest=<id>&group=FEMALE:K5&group=…`, optionally `template=<id>` instead of the default one,
 * or `template=auto` for the one of each category, and `provisional=1` to include running
 * divisions.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const competition = context.get(competitionContext);
  const params = await readParams(request);
  const contestId = params.get('contest');
  const groups = params.getAll('group');
  if (!contestId || groups.length === 0) throw data(null, 400);

  const loaded = await loadGroups(
    competition.id,
    contestId,
    groups,
    params.get('provisional') === '1',
  );
  const templateId = params.get('template');
  const parts =
    templateId === 'auto'
      ? await groupByTemplate(competition.id, loaded)
      : [{ templateId, groups: loaded }];
  const sections = await Promise.all(
    parts.map(async (part) => ({
      groups: part.groups,
      ...(await orNotFound(getRankingTemplate(competition.id, part.templateId))),
    })),
  );

  return rankingPdfResponse({
    competition,
    sections,
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
  const section = {
    groups:
      contestId && group
        ? await loadGroups(competition.id, contestId, [group], false)
        : createSampleGroups(),
    options: options.data,
    cover: templateId
      ? (await orNotFound(getRankingTemplate(competition.id, templateId))).cover
      : [],
  };
  return rankingPdfResponse({
    competition,
    sections: [section],
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
