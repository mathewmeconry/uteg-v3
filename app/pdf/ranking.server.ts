import { createElement } from 'react';
import type { Sex } from '~/generated/prisma/client';
import { getLogo } from '~/lib/assets.server';
import type { RankingTemplateOptions } from '~/lib/domain/rankingTemplate';
import { formatDateRange } from '~/lib/format';
import { getRanking } from '~/lib/ranking.server';
import type { Language, ServerT } from '~/locales';
import { RankingDocument, type RankingGroup } from './RankingDocument';
import { pdfResponse } from './pdf.server';

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
  const ranking = await getRanking(competitionId, contestId, { category, sex, provisional });
  return { ...ranking, category, sex, provisional: provisional && ranking.hasRunning };
}

export async function rankingPdfResponse({
  competition,
  groups,
  options,
  t,
  language,
}: {
  competition: Competition;
  groups: RankingGroup[];
  options: RankingTemplateOptions;
  t: ServerT;
  language: Language;
}) {
  const logo = options.showLogo ? await getLogo(competition.id) : null;
  const { name, location, startDate, endDate } = competition;
  const labels = groups.map(({ category, sex }) => `${category} ${t(`pdf:sex.${sex}`)}`);
  return pdfResponse(
    createElement(RankingDocument, {
      groups,
      options,
      competition: { name, location, date: formatDateRange(startDate, endDate, language) },
      logo,
      t,
      language,
    }),
    [t('ranking:title'), ...(labels.length > 3 ? [] : labels), name].join(' '),
  );
}
