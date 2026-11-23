import type { Prisma, Sex } from '~/generated/prisma/client';
import { getContestModule, getModule } from '~/modules/registry';
import { selectQualifiers } from './domain/ranking';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';
import { getRanking } from './ranking.server';

/** The contest with its module bound to the stored config. */
export async function getContest(
  competitionId: string,
  contestId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  const contest = await tx.contest.findFirst({ where: { id: contestId, competitionId } });
  if (!contest) throw new DomainError('NOT_FOUND');
  return { ...contest, module: getContestModule(contest) };
}

export async function updateContestConfig(
  competitionId: string,
  contestId: string,
  config: unknown,
) {
  const contest = await getContest(competitionId, contestId);
  await prisma.contest.update({
    where: { id: contest.id },
    data: { config: parseContestConfig(contest.module.key, config) },
  });
  publish(competitionId, 'settings');
}

/** Validates a config for a module. Without one the module's default is used. */
export function parseContestConfig(moduleKey: string, config?: unknown) {
  let module;
  try {
    module = getModule(moduleKey);
  } catch {
    throw new DomainError('INVALID_CONFIG');
  }
  const result = module.configSchema.safeParse(config ?? module.defaultConfig);
  if (!result.success) throw new DomainError('INVALID_CONFIG');
  return result.data as Prisma.InputJsonValue;
}

export type QualificationGroup = {
  sex: Sex;
  sourceCategories: readonly string[];
  /** How many ranks of each source category qualify. */
  topN: number;
  targetCategory: string;
};

/** A new contest for the best of another one, e.g. a final. Entries come in ranking order. */
export async function createContestFromRanking(
  competitionId: string,
  sourceContestId: string,
  {
    module: moduleKey,
    name,
    groups,
  }: { module: string; name: string; groups: QualificationGroup[] },
) {
  const config = parseContestConfig(moduleKey);
  const module = getContestModule({ module: moduleKey, config });

  const categories = new Map<string, string>();
  for (const { sex, sourceCategories, topN, targetCategory } of groups) {
    if (!module.categories(sex).includes(targetCategory)) throw new DomainError('INVALID_CATEGORY');
    for (const category of sourceCategories) {
      const ranking = await getRanking(competitionId, sourceContestId, { category, sex });
      // Someone still to compete could qualify.
      const pending = await prisma.division.count({
        where: { contestId: sourceContestId, category, sex, state: { not: 'ENDED' } },
      });
      if (pending > 0) throw new DomainError('DIVISION_NOT_ENDED');
      for (const { starterId } of selectQualifiers(ranking.entries, topN)) {
        if (!categories.has(starterId)) categories.set(starterId, targetCategory);
      }
    }
  }

  const contest = await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const position = await tx.contest.count({ where: { competitionId } });
    return tx.contest.create({
      data: {
        competitionId,
        module: moduleKey,
        name,
        position,
        config,
        sourceContestId,
        entries: {
          create: [...categories].map(([starterId, category], index) => ({
            starterId,
            category,
            position: index,
          })),
        },
      },
    });
  });
  publish(competitionId, 'settings');
  return contest;
}
