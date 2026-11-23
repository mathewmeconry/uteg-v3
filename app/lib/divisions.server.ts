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
      _count: { select: { entries: { where: { withdrawnAt: null } } } },
    },
    orderBy: [
      { contest: { position: 'asc' } },
      { category: 'asc' },
      { sex: 'asc' },
      { number: 'asc' },
    ],
  });
  return divisions.map(({ _count, progress, ...division }) => ({
    ...division,
    round: getCurrentRound(progress),
    rounds: progress.length,
    /** Confirmed rounds by apparatus. */
    progress: Object.fromEntries(
      progress.map(({ apparatus, completedRounds }) => [apparatus, completedRounds]),
    ),
    starterCount: _count.entries,
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

/** Deletes the division and closes the gap in the numbers. Its starters become unassigned. */
export async function deleteDivision(competitionId: string, divisionId: string) {
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    await lockDivisions(tx, competitionId);
    const division = await tx.division.findFirst({
      where: { id: divisionId, contest: { competitionId } },
    });
    if (!division) throw new DomainError('NOT_FOUND');
    if (division.state === 'RUNNING') throw new DomainError('DIVISION_RUNNING');

    const { contestId, category, sex } = division;
    await tx.division.delete({ where: { id: divisionId } });
    const following = await tx.division.findMany({
      where: { contestId, category, sex, number: { gt: division.number } },
      orderBy: { number: 'asc' },
    });
    // One by one: the number must be unique after every step.
    for (const { id, number } of following) {
      await tx.division.update({ where: { id }, data: { number: number - 1 } });
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
