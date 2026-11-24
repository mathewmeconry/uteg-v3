import type { Sex } from '~/generated/prisma/client';
import { getContest } from './contests.server';
import { rankEntries } from './domain/ranking';
import { DomainError } from './errors';
import { prisma } from './prisma.server';

export type RankingResult = Awaited<ReturnType<typeof getRanking>>;

/** The categories that have started divisions, in the order of the module. */
export async function listRankingGroups(competitionId: string, contestId: string) {
  const { module } = await getContest(competitionId, contestId);
  const divisions = await prisma.division.groupBy({
    by: ['sex', 'category', 'state'],
    where: { contestId, state: { not: 'PENDING' } },
  });
  return (['FEMALE', 'MALE'] as const).flatMap((sex) =>
    module.categories(sex).flatMap((category) => {
      const states = divisions
        .filter((division) => division.sex === sex && division.category === category)
        .map(({ state }) => state);
      return states.length ? [{ sex, category, hasEnded: states.includes('ENDED') }] : [];
    }),
  );
}

/** How far each category is, without divisions `null`, in the order of the module. */
export async function listCategoryStates(competitionId: string, contestId: string) {
  const { module } = await getContest(competitionId, contestId);
  const divisions = await prisma.division.groupBy({
    by: ['sex', 'category', 'state'],
    where: { contestId },
  });
  return (['FEMALE', 'MALE'] as const).flatMap((sex) =>
    module.categories(sex).flatMap((category) => {
      const states = new Set(
        divisions
          .filter((division) => division.sex === sex && division.category === category)
          .map(({ state }) => state),
      );
      const only = [...states].at(0) ?? null;
      const isPartly = states.size > 1;
      const state = states.has('RUNNING') ? 'RUNNING' : isPartly ? ('PARTLY' as const) : only;
      return [{ sex, category, state }];
    }),
  );
}

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
        startApparatus: { not: null },
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
    /** Grades that count as zero because they were never entered or deleted afterwards. */
    missingGrades: entries
      .map(({ grades }) => new Set(grades.map((grade) => grade.apparatus)))
      .reduce((sum, graded) => sum + apparatus.filter((key) => !graded.has(key)).length, 0),
    lastUpdated: changes.length ? new Date(Math.max(...changes)) : null,
  };
}
