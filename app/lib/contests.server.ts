import type { Prisma, Sex } from '~/generated/prisma/client';
import { getContestModule, getModule, type BoundModule } from '~/modules/registry';
import { aggregate } from './domain/grade';
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

/** Saves the config and recomputes the stored grades whose attempts are now combined differently. */
export async function updateContestConfig(
  competitionId: string,
  contestId: string,
  config: unknown,
) {
  const recomputed = await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const contest = await getContest(competitionId, contestId, tx);
    const newConfig = parseContestConfig(contest.module.key, config);
    await tx.contest.update({ where: { id: contest.id }, data: { config: newConfig } });
    const module = getContestModule({ module: contest.module.key, config: newConfig });
    return recomputeGrades(tx, contest.id, contest.module, module);
  });
  publish(competitionId, 'settings');
  if (recomputed > 0) publish(competitionId, 'grades');
  return { recomputed };
}

export type AttemptGradeCount = {
  apparatus: string;
  category: string;
  attempts: number;
  count: number;
};

/** How many grades were entered as attempts. They depend on the input rules of the config. */
export async function countAttemptGrades(
  competitionId: string,
  contestId: string,
): Promise<AttemptGradeCount[]> {
  const contest = await getContest(competitionId, contestId);
  const groups = Map.groupBy(
    await findAttemptGrades(prisma, contest.id),
    ({ apparatus, category, attempts }) => JSON.stringify([apparatus, category, attempts.length]),
  );
  return [...groups.values()].map((grades) => {
    const [{ apparatus, category, attempts }] = grades;
    return { apparatus, category, attempts: attempts.length, count: grades.length };
  });
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findAttemptGrades(tx: Prisma.TransactionClient, contestId: string) {
  const grades = await tx.grade.findMany({
    where: { entry: { contestId }, NOT: { attempts: { isEmpty: true } } },
    include: { entry: { include: { division: true } } },
  });
  return grades.map(({ id, apparatus, value, attempts, updatedAt, entry }) => ({
    id,
    apparatus,
    value,
    attempts,
    updatedAt,
    category: entry.category ?? entry.division?.category ?? '',
  }));
}

/** Grades with another number of attempts than the new rule keep their value. */
async function recomputeGrades(
  tx: Prisma.TransactionClient,
  contestId: string,
  oldModule: BoundModule,
  newModule: BoundModule,
) {
  let recomputed = 0;
  const grades = await findAttemptGrades(tx, contestId);
  for (const { id, apparatus, category, value, attempts, updatedAt } of grades) {
    const rule = newModule.inputRule(apparatus, category);
    const oldRule = oldModule.inputRule(apparatus, category);
    const isSameRule =
      rule.attempts === oldRule.attempts && rule.aggregation === oldRule.aggregation;
    if (isSameRule || rule.attempts !== attempts.length) continue;
    const newValue = aggregate(attempts, rule.aggregation);
    if (newValue === null || newValue === value) continue;
    // Dashboard and displays show who was graded last, which does not change.
    await tx.grade.update({ where: { id }, data: { value: newValue, updatedAt } });
    recomputed++;
  }
  return recomputed;
}
