import type { Sex } from '~/generated/prisma/client';
import { getLogo } from '~/lib/assets.server';
import type { RankingTemplateOptions } from '~/lib/domain/rankingTemplate';
import { formatDateRange } from '~/lib/format';
import { getRanking } from '~/lib/ranking.server';
import type { Language, ServerT } from '~/locales';
import type { RankingGroup } from './RankingDocument';
import { pdfResponse } from './response.server';

type Competition = {
  id: string;
  name: string;
  location: string;
  startDate: Date;
  endDate: Date;
};

export async function loadRankingGroup(
  competitionId: string,
  contestId: string,
  { category, sex, provisional }: { category: string; sex: Sex; provisional: boolean },
): Promise<RankingGroup> {
  const { hasRunning, options, ...ranking } = await getRanking(competitionId, contestId, {
    category,
    sex,
    provisional,
  });
  const status = provisional ? 'provisional' : 'incomplete';
  return {
    ...ranking,
    category,
    sex,
    status: hasRunning ? status : null,
    precision: options.precision,
  };
}

export async function rankingPdfResponse({
  competition,
  groups,
  options,
  signal,
  t,
  language,
}: {
  competition: Competition;
  groups: RankingGroup[];
  options: RankingTemplateOptions;
  signal: AbortSignal;
  t: ServerT;
  language: Language;
}) {
  const logo = options.showLogo ? await getLogo(competition.id) : null;
  const { name, location, startDate, endDate } = competition;
  const labels = groups.map(({ category, sex }) => `${category} ${t(`pdf:sex.${sex}`)}`);
  return pdfResponse(
    {
      type: 'ranking',
      language,
      props: {
        groups,
        options,
        competition: { name, location, date: formatDateRange(startDate, endDate, language) },
        logo,
      },
    },
    { name: [t('ranking:title'), ...(labels.length > 3 ? [] : labels), name].join(' '), signal, t },
  );
}
