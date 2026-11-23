import { createHash } from 'node:crypto';
import type { Prisma } from '~/generated/prisma/client';
import { getContestModule, getModule, type BoundModule } from '~/modules/registry';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockContest } from './locks.server';
import { prisma } from './prisma.server';

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

/** Changes parts of the config, keeping what others change at the same time. */
export async function patchContestConfig<Config = unknown>(
  competitionId: string,
  contestId: string,
  change: (config: Config) => unknown,
  { version }: { version?: string } = {},
) {
  await prisma.$transaction(async (tx) => {
    await lockContest(tx, contestId);
    const contest = await getContest(competitionId, contestId, tx);
    if (version !== undefined && version !== getConfigVersion(contest)) {
      throw new DomainError('CONFIG_CHANGED');
    }
    // The config is validated by the module, which the caller knows.
    const changed = change(contest.module.config as Config);
    if (!changed) throw new DomainError('INVALID_CONFIG');
    const config = parseContestConfig(contest.module.key, changed);
    const module = getContestModule({ module: contest.module.key, config });
    await assertRulesNotInUse(tx, contest.id, contest.module, module);
    await tx.contest.update({ where: { id: contest.id }, data: { config } });
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** How attempts are combined cannot change once there are grades that were computed that way. */
async function assertRulesNotInUse(
  tx: Prisma.TransactionClient,
  contestId: string,
  oldModule: BoundModule,
  newModule: BoundModule,
) {
  const grades = await tx.grade.findMany({
    where: { entry: { contestId }, NOT: { attempts: { isEmpty: true } } },
    select: {
      apparatus: true,
      entry: { select: { category: true, division: { select: { category: true } } } },
    },
  });
  for (const { apparatus, entry } of grades) {
    const category = entry.category ?? entry.division?.category ?? '';
    const before = oldModule.inputRule(apparatus, category);
    const after = newModule.inputRule(apparatus, category);
    if (before.attempts !== after.attempts || before.aggregation !== after.aggregation) {
      throw new DomainError('RULE_IN_USE');
    }
  }
}
