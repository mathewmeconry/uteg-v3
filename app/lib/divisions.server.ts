import type { DivisionState, Prisma, Sex } from '~/generated/prisma/client';
import { getContest } from './contests.server';
import { getCurrentRound } from './domain/progress';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition, lockDivisions } from './locks.server';
import { prisma } from './prisma.server';

export type DivisionFilter = {
  contestId?: string;
  ground?: number;
  state?: DivisionState;
  ids?: string[];
};

export async function listDivisions(competitionId: string, filter: DivisionFilter = {}) {
  const { ids, ...where } = filter;
  const divisions = await prisma.division.findMany({
    where: { ...where, id: ids && { in: ids }, contest: { competitionId } },
    include: {
      apparatus: true,
      entries: { where: { withdrawnAt: null }, select: { startApparatus: true } },
    },
    orderBy: [
      { contest: { position: 'asc' } },
      { category: 'asc' },
      { sex: 'asc' },
      { number: 'asc' },
    ],
  });
  return divisions.map(({ entries, apparatus, ...division }) => ({
    ...division,
    round: getCurrentRound(apparatus),
    rounds: apparatus.length,
    /** Confirmed rounds by apparatus. */
    progress: Object.fromEntries(
      apparatus.map(({ apparatus: key, completedRounds }) => [key, completedRounds]),
    ),
    starterCount: entries.length,
    /** Starters without a lineup, no tablet shows them. */
    unassignedCount: entries.filter(({ startApparatus }) => !startApparatus).length,
  }));
}

export async function createDivision(competitionId: string, contestId: string, input: NewDivision) {
  const division = await prisma.$transaction((tx) =>
    insertDivision(tx, competitionId, contestId, input),
  );
  publish(competitionId, 'divisions');
  return division;
}

/** Who takes part in the contest, but is in no division yet. Clubs and names in order. */
export function listWithoutDivision(contestId: string) {
  return prisma.entry.findMany({
    where: { contestId, divisionId: null, category: { not: null }, ...ACTIVE },
    select: {
      id: true,
      category: true,
      starter: { select: { sex: true, club: { select: { id: true, name: true } } } },
    },
    orderBy: [
      { starter: { club: { name: 'asc' } } },
      { starter: { clubId: 'asc' } },
      { starter: { lastname: 'asc' } },
      { starter: { firstname: 'asc' } },
      { id: 'asc' },
    ],
  });
}

/**
 * Creates divisions with their lineups, the ids of the entries by apparatus, in running order. Only with entries that
 * are in no division yet. All or none.
 */
export async function createDivisionsWithLineups(
  competitionId: string,
  contestId: string,
  groups: readonly (NewDivision & { divisions: Record<string, string[]>[] })[],
) {
  await prisma.$transaction(
    async (tx) => {
      // Starters do not change meanwhile.
      await lockCompetition(tx, competitionId);
      for (const { divisions, ...input } of groups) {
        const { category, sex } = input;
        const entryIds = divisions.flatMap((lineups) => Object.values(lineups).flat());
        const count = await tx.entry.count({
          where: {
            ...ACTIVE,
            id: { in: entryIds },
            contestId,
            category,
            divisionId: null,
            starter: { sex, deletedAt: null },
          },
        });
        if (count !== entryIds.length) throw new DomainError('PROPOSAL_OUTDATED');

        for (const lineups of divisions) {
          await insertWithLineups(tx, competitionId, contestId, input, lineups);
        }
      }
    },
    { timeout: 60_000 },
  );
  publish(competitionId, 'divisions');
}

/** On another ground it is due last. */
export async function updateDivision(
  competitionId: string,
  divisionId: string,
  { ground }: { ground: number },
) {
  await prisma.$transaction(async (tx) => {
    const competition = await lockCompetition(tx, competitionId);
    assertGround(ground, competition.grounds);
    await lockDivisions(tx, competitionId, [divisionId]);
    const division = await tx.division.findUniqueOrThrow({ where: { id: divisionId } });
    if (division.ground === ground) return;
    const position = await nextPosition(tx, competitionId, ground);
    await tx.division.update({ where: { id: divisionId }, data: { ground, position } });
  });
  publish(competitionId, 'divisions');
}

/** Puts a planned division before another one of the ground, without `beforeId` at the end. */
export async function moveDivision(
  competitionId: string,
  divisionId: string,
  { ground, beforeId }: { ground: number; beforeId?: string },
) {
  await prisma.$transaction(async (tx) => {
    const competition = await lockCompetition(tx, competitionId);
    assertGround(ground, competition.grounds);
    await lockDivisions(tx, competitionId);
    const [state] = await lockAndGetStates(tx, competitionId, [divisionId]);
    if (state !== 'PENDING') throw new DomainError('DIVISION_NOT_PENDING');

    const others = await tx.division.findMany({
      where: { ground, contest: { competitionId }, id: { not: divisionId } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const ids = others.map(({ id }) => id);
    // It may have been moved or deleted meanwhile.
    const index = beforeId ? ids.indexOf(beforeId) : -1;
    ids.splice(index < 0 ? ids.length : index, 0, divisionId);
    for (const [index, id] of ids.entries()) {
      await tx.division.update({ where: { id }, data: { ground, position: index + 1 } });
    }
  });
  publish(competitionId, 'divisions');
}

/** Deletes all or none and closes the gaps in the numbers. Their starters become unassigned. */
export async function deleteDivisions(competitionId: string, ids: string[]) {
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    await lockDivisions(tx, competitionId);
    const states = await lockAndGetStates(tx, competitionId, ids);
    if (states.includes('RUNNING')) throw new DomainError('DIVISION_RUNNING');

    // The highest number first, so the gaps of the others stay where they are.
    const divisions = await tx.division.findMany({
      where: { id: { in: ids } },
      orderBy: { number: 'desc' },
    });
    for (const { id: divisionId, contestId, category, sex, number } of divisions) {
      // The foreign keys only clear what they refer to, which is not always both.
      await tx.entry.updateMany({
        where: { divisionId },
        data: { divisionId: null, startApparatus: null },
      });
      await tx.division.delete({ where: { id: divisionId } });
      const following = await tx.division.findMany({
        where: { contestId, category, sex, number: { gt: number } },
        orderBy: { number: 'asc' },
      });
      // One by one: the number must be unique after every step.
      for (const division of following) {
        const data = { number: division.number - 1 };
        await tx.division.update({ where: { id: division.id }, data });
      }
    }
  });
  publish(competitionId, 'divisions');
}

/**
 * Starts divisions from the first round, keeping their grades. Ended ones need `restart`, because
 * they drop out of the ranking until they end again.
 */
export async function startDivisions(
  competitionId: string,
  ids: string[],
  { restart = false }: { restart?: boolean } = {},
) {
  await prisma.$transaction(async (tx) => {
    const states = await lockAndGetStates(tx, competitionId, ids);
    if (states.includes('RUNNING')) throw new DomainError('DIVISION_RUNNING');
    if (states.includes('ENDED') && !restart) throw new DomainError('RESTART_NOT_CONFIRMED');

    await tx.divisionApparatus.updateMany({
      where: { divisionId: { in: ids } },
      data: { completedRounds: 0 },
    });
    await tx.division.updateMany({
      where: { id: { in: ids } },
      data: { state: 'RUNNING', startedAt: new Date(), endedAt: null },
    });
  });
  publish(competitionId, 'divisions');
}

export async function stopDivisions(competitionId: string, ids: string[]) {
  await prisma.$transaction(async (tx) => {
    const states = await lockAndGetStates(tx, competitionId, ids);
    if (states.some((state) => state !== 'RUNNING')) throw new DomainError('DIVISION_NOT_RUNNING');
    await tx.division.updateMany({ where: { id: { in: ids } }, data: { state: 'PENDING' } });
  });
  publish(competitionId, 'divisions');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type NewDivision = { category: string; sex: Sex; ground: number };

const ACTIVE = { withdrawnAt: null, starter: { deletedAt: null } } satisfies Prisma.EntryWhereInput;

async function insertDivision(
  tx: Prisma.TransactionClient,
  competitionId: string,
  contestId: string,
  { category, sex, ground }: NewDivision,
) {
  const competition = await lockCompetition(tx, competitionId);
  assertGround(ground, competition.grounds);
  if (!competition.sexes.includes(sex)) throw new DomainError('SEX_NOT_ALLOWED');
  const { module } = await getContest(competitionId, contestId, tx);
  if (!module.categories(sex).includes(category)) throw new DomainError('INVALID_CATEGORY');

  const last = await tx.division.aggregate({
    where: { contestId, category, sex },
    _max: { number: true },
  });
  return tx.division.create({
    data: {
      contestId,
      category,
      sex,
      ground,
      position: await nextPosition(tx, competitionId, ground),
      number: (last._max.number ?? 0) + 1,
      apparatus: { create: module.apparatus(sex).map((apparatus) => ({ apparatus })) },
    },
    include: { apparatus: true },
  });
}

async function insertWithLineups(
  tx: Prisma.TransactionClient,
  competitionId: string,
  contestId: string,
  input: NewDivision,
  lineups: Record<string, string[]>,
) {
  const division = await insertDivision(tx, competitionId, contestId, input);
  const apparatus = division.apparatus.map(({ apparatus }) => apparatus);
  for (const [startApparatus, ids] of Object.entries(lineups)) {
    if (!apparatus.includes(startApparatus)) throw new DomainError('INVALID_APPARATUS');
    for (const [position, id] of ids.entries()) {
      const data = { divisionId: division.id, startApparatus, position };
      await tx.entry.update({ where: { id }, data });
    }
  }
}

function assertGround(ground: number, grounds: number) {
  if (!Number.isInteger(ground) || ground < 1 || ground > grounds) {
    throw new DomainError('INVALID_GROUND');
  }
}

async function nextPosition(tx: Prisma.TransactionClient, competitionId: string, ground: number) {
  const last = await tx.division.aggregate({
    where: { ground, contest: { competitionId } },
    _max: { position: true },
  });
  return (last._max.position ?? 0) + 1;
}

async function lockAndGetStates(
  tx: Prisma.TransactionClient,
  competitionId: string,
  ids: string[],
) {
  await lockDivisions(tx, competitionId, ids);
  const divisions = await tx.division.findMany({
    where: { id: { in: ids } },
    select: { state: true },
  });
  return divisions.map(({ state }) => state);
}
