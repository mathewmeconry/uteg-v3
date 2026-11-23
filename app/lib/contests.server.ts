import { createHash } from 'node:crypto';
import type { Prisma, Sex } from '~/generated/prisma/client';
import { getContestModule, getModule, type BoundModule } from '~/modules/registry';
import { aggregate } from './domain/grade';
import { selectQualifiers } from './domain/ranking';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition, lockContest } from './locks.server';
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

/** Changes with the config. Pages send back the version they edited. */
export function getConfigVersion({ config }: { config: unknown }) {
  // jsonb returns the keys of equal objects in the same order.
  return createHash('sha256').update(JSON.stringify(config)).digest('base64url');
}

/** Replaces the config. With a `version` only when nobody else changed it since. */
export function updateContestConfig(
  competitionId: string,
  contestId: string,
  config: unknown,
  { version }: { version?: string } = {},
) {
  return patchContestConfig(competitionId, contestId, () => config, { version });
}

/**
 * Changes parts of the config, keeping what others change at the same time, and recomputes the
 * stored grades whose attempts are now combined differently.
 */
export async function patchContestConfig<Config = unknown>(
  competitionId: string,
  contestId: string,
  change: (config: Config) => unknown,
  { version }: { version?: string } = {},
) {
  const recomputed = await prisma.$transaction(async (tx) => {
    await lockContest(tx, contestId);
    const contest = await getContest(competitionId, contestId, tx);
    if (version !== undefined && version !== getConfigVersion(contest)) {
      throw new DomainError('CONFIG_CHANGED');
    }
    // The config is validated by the module, which the caller knows.
    const changed = change(contest.module.config as Config);
    if (!changed) throw new DomainError('INVALID_CONFIG');
    const newConfig = parseContestConfig(contest.module.key, changed);
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
    select: {
      id: true,
      apparatus: true,
      value: true,
      attempts: true,
      entry: { select: { category: true, division: { select: { category: true } } } },
    },
  });
  return grades.map(({ entry, ...grade }) => ({
    ...grade,
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
  const ids: string[] = [];
  const values: number[] = [];
  for (const grade of await findAttemptGrades(tx, contestId)) {
    const { id, apparatus, category, value, attempts } = grade;
    const rule = newModule.inputRule(apparatus, category);
    const oldRule = oldModule.inputRule(apparatus, category);
    const isSameRule =
      rule.attempts === oldRule.attempts && rule.aggregation === oldRule.aggregation;
    if (isSameRule || rule.attempts !== attempts.length) continue;
    const newValue = aggregate(attempts, rule.aggregation);
    if (newValue === null || newValue === value) continue;
    ids.push(id);
    values.push(newValue);
  }
  if (ids.length === 0) return 0;
  // Keeps updatedAt: dashboard and displays show who was graded last, which does not change. The
  // version changes, so nobody replaces a value they have not seen.
  return tx.$executeRaw`
    UPDATE grade SET value = changed.value, version = version + 1
    FROM unnest(${ids}::text[], ${values}::int[]) AS changed(id, value)
    WHERE grade.id = changed.id`;
}
