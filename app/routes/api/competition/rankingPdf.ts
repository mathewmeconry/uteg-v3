import { data } from 'react-router';
import type { Route } from './+types/rankingPdf';
import { competitionContext, languageContext } from '~/context';
import { rankingTemplateSchema } from '~/lib/domain/rankingTemplate';
import { getDefaultRankingTemplate, listRankingTemplates } from '~/lib/rankingTemplates.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { loadRankingGroup, rankingPdfResponse } from '~/pdf/ranking.server';
import { orNotFound, parseRankingGroup } from '~/pdf/request.server';
import { createSampleGroups } from '~/pdf/sample';

/**
 * `?contest=<id>&group=FEMALE:K5&group=…`, optionally `template=<id>` instead of the default one
 * and `provisional=1` to include running divisions.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const competition = context.get(competitionContext);
  const params = new URL(request.url).searchParams;
  const contestId = params.get('contest');
  const groups = params.getAll('group');
  if (!contestId || groups.length === 0) throw data(null, 400);

  return rankingPdfResponse({
    competition,
    groups: await loadGroups(competition.id, contestId, groups, params.get('provisional') === '1'),
    options: await getOptions(competition.id, params.get('template')),
    t: getT(context),
    language: context.get(languageContext),
  });
}

/** A preview of unsaved options, with the ranking `group` of `contest` or sample data. */
export async function action({ request, context }: Route.ActionArgs) {
  const competition = requireRole(context, 'EDITOR');
  const formData = await request.formData();
  const options = rankingTemplateSchema.safeParse(parseJson(formData.get('options')));
  if (!options.success) throw data(null, 400);

  const contestId = formData.get('contest');
  const group = formData.get('group');
  return rankingPdfResponse({
    competition,
    groups:
      typeof contestId === 'string' && typeof group === 'string'
        ? await loadGroups(competition.id, contestId, [group], false)
        : createSampleGroups(),
    options: options.data,
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

async function getOptions(competitionId: string, templateId: string | null) {
  if (!templateId) return getDefaultRankingTemplate(competitionId);
  const templates = await listRankingTemplates(competitionId);
  const template = templates.find(({ id }) => id === templateId);
  if (!template) throw data(null, 404);
  return template.options;
}

function parseJson(value: FormDataEntryValue | null): unknown {
  try {
    return typeof value === 'string' ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}
