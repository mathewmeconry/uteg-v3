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
      lineups: true,
      progress: true,
      entries: { where: { withdrawnAt: null }, select: { lineupId: true } },
    },
    orderBy: [
      { contest: { position: 'asc' } },
      { category: 'asc' },
      { sex: 'asc' },
      { number: 'asc' },
    ],
  });
  return divisions.map(({ entries, progress, ...division }) => ({
    ...division,
    round: getCurrentRound(progress),
    rounds: progress.length,
    /** Confirmed rounds by apparatus. */
    progress: Object.fromEntries(
      progress.map(({ apparatus, completedRounds }) => [apparatus, completedRounds]),
    ),
    starterCount: entries.length,
    /** Starters without a lineup, no tablet shows them. */
    unassignedCount: entries.filter(({ lineupId }) => !lineupId).length,
  }));
}

export async function createDivision(
  competitionId: string,
  contestId: string,
  { category, sex, ground }: { category: string; sex: Sex; ground: number },
) {
  const division = await prisma.$transaction(async (tx) => {
    const competition = await lockCompetition(tx, competitionId);
    assertGround(ground, competition.grounds);
    const { module } = await getContest(competitionId, contestId, tx);
    if (!module.categories(sex).includes(category)) throw new DomainError('INVALID_CATEGORY');

    const last = await tx.division.aggregate({
      where: { contestId, category, sex },
      _max: { number: true },
    });
    const apparatus = module.apparatus(sex).map((key) => ({ apparatus: key }));
    return tx.division.create({
      data: {
        contestId,
        category,
        sex,
        ground,
        number: (last._max.number ?? 0) + 1,
        lineups: { create: apparatus },
        progress: { create: apparatus },
      },
      include: { lineups: true },
    });
  });
  publish(competitionId, 'divisions');
  return division;
}

export async function updateDivision(
  competitionId: string,
  divisionId: string,
  { ground }: { ground: number },
) {
  await prisma.$transaction(async (tx) => {
    const competition = await lockCompetition(tx, competitionId);
    assertGround(ground, competition.grounds);
    await lockDivisions(tx, competitionId, [divisionId]);
    await tx.division.update({ where: { id: divisionId }, data: { ground } });
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

    await tx.divisionProgress.updateMany({
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

function assertGround(ground: number, grounds: number) {
  if (!Number.isInteger(ground) || ground < 1 || ground > grounds) {
    throw new DomainError('INVALID_GROUND');
  }
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
