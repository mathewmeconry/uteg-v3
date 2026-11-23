import type { Sex } from '~/generated/prisma/client';
import { getContest } from './contests.server';
import { rankEntries } from './domain/ranking';
import { DomainError } from './errors';
import { prisma } from './prisma.server';

export type RankingResult = Awaited<ReturnType<typeof getRanking>>;

/** The ranking of the ended divisions, `provisional` adds the running ones. */
export async function getRanking(
  competitionId: string,
  contestId: string,
  { category, sex, provisional = false }: { category: string; sex: Sex; provisional?: boolean },
) {
  const { module } = await getContest(competitionId, contestId);
  if (!module.categories(sex).includes(category)) throw new DomainError('INVALID_CATEGORY');

  const group = { contestId, category, sex };
  const [entries, running] = await Promise.all([
    prisma.entry.findMany({
      where: {
        lineupId: { not: null },
        withdrawnAt: null,
        division: { ...group, state: { in: provisional ? ['ENDED', 'RUNNING'] : ['ENDED'] } },
      },
      include: { grades: true, starter: { include: { club: true } } },
      orderBy: [{ starter: { lastname: 'asc' } }, { starter: { firstname: 'asc' } }, { id: 'asc' }],
    }),
    prisma.division.count({ where: { ...group, state: 'RUNNING' } }),
  ]);

  const apparatus = module.apparatus(sex);
  const options = module.rankingOptions(category, sex);
  const changes = entries.flatMap(({ grades }) => grades.map(({ updatedAt }) => +updatedAt));
  return {
    ...rankEntries(
      entries.map(({ id, starter, grades }) => ({
        id,
        starterId: starter.id,
        firstname: starter.firstname,
        lastname: starter.lastname,
        birthYear: starter.birthYear,
        clubName: starter.club.name,
        clubLocation: starter.club.location,
        grades: Object.fromEntries(grades.map((grade) => [grade.apparatus, grade.value])),
      })),
      apparatus,
      options,
    ),
    apparatus,
    options,
    /** Entries of running divisions are missing, or not final when provisional. */
    hasRunning: running > 0,
    lastUpdated: changes.length ? new Date(Math.max(...changes)) : null,
  };
}
