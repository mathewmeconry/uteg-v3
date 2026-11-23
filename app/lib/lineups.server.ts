import type { Prisma } from '~/generated/prisma/client';
import { getContestModule } from '~/modules/registry';
import { isVisible } from './domain/rotation';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockDivisions } from './locks.server';
import { prisma } from './prisma.server';

const LINEUP_ORDER = [{ position: 'asc' }, { id: 'asc' }] as const;

/** The division's lineups in rotation order and the entries that are in none. */
export async function getDivisionLineups(competitionId: string, divisionId: string) {
  const division = await prisma.division.findFirst({
    where: { id: divisionId, contest: { competitionId } },
    include: {
      contest: true,
      lineups: true,
      entries: { orderBy: [...LINEUP_ORDER], include: { starter: { include: { club: true } } } },
    },
  });
  if (!division) throw new DomainError('NOT_FOUND');

  const { contest, lineups, entries: allEntries, ...data } = division;
  const entries = allEntries.filter((entry) => isVisible(entry, division));
  const apparatus = getContestModule(contest).apparatus(division.sex);
  return {
    division: data,
    lineups: lineups
      .toSorted((a, b) => apparatus.indexOf(a.apparatus) - apparatus.indexOf(b.apparatus))
      .map((lineup) => ({
        ...lineup,
        entries: entries.filter(({ lineupId }) => lineupId === lineup.id),
      })),
    unassigned: entries.filter(({ lineupId, withdrawnAt }) => !lineupId && !withdrawnAt),
  };
}

/**
 * Moves entries of the division into a lineup, in this order: before the entry `beforeId`, or to
 * the end. Not the whole order, so that several people can arrange the same lineup. Also while it
 * runs, e.g. for somebody who came late: what they miss on an apparatus that has already passed is
 * asked for when the division ends, see confirmRound.
 */
export async function moveEntriesToLineup(
  competitionId: string,
  lineupId: string,
  entryIds: string[],
  beforeId?: string,
) {
  await prisma.$transaction(async (tx) => {
    const lineup = await lockLineup(tx, competitionId, lineupId);
    await assertInDivision(tx, lineup.divisionId, entryIds);
    const others = lineup.entries.map(({ id }) => id).filter((id) => !entryIds.includes(id));
    const index = others.findIndex((id) => id === beforeId);
    await savePositions(
      tx,
      lineupId,
      others.toSpliced(index < 0 ? Infinity : index, 0, ...entryIds),
    );
  });
  publish(competitionId, 'divisions');
}

/** Takes entries of the division out of their lineups. */
export async function unassignEntries(
  competitionId: string,
  divisionId: string,
  entryIds: string[],
) {
  await prisma.$transaction(async (tx) => {
    await lockDivisions(tx, competitionId, [divisionId]);
    await assertInDivision(tx, divisionId, entryIds);
    await tx.entry.updateMany({ where: { id: { in: entryIds } }, data: { lineupId: null } });
  });
  publish(competitionId, 'divisions');
}

/** The position after the last entry of a lineup. */
export function nextPosition(entries: { position: number }[]) {
  return Math.max(-1, ...entries.map(({ position }) => position)) + 1;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function lockLineup(tx: Prisma.TransactionClient, competitionId: string, lineupId: string) {
  const lineup = await tx.lineup.findFirst({
    where: { id: lineupId, division: { contest: { competitionId } } },
  });
  if (!lineup) throw new DomainError('NOT_FOUND');
  await lockDivisions(tx, competitionId, [lineup.divisionId]);
  const entries = await tx.entry.findMany({ where: { lineupId }, orderBy: [...LINEUP_ORDER] });
  return { ...lineup, entries };
}

async function assertInDivision(
  tx: Prisma.TransactionClient,
  divisionId: string,
  entryIds: string[],
) {
  const count = await tx.entry.count({ where: { id: { in: entryIds }, divisionId } });
  if (count !== entryIds.length) throw new DomainError('ENTRY_NOT_IN_DIVISION');
}

async function savePositions(tx: Prisma.TransactionClient, lineupId: string, entryIds: string[]) {
  for (const [position, id] of entryIds.entries()) {
    await tx.entry.update({ where: { id }, data: { lineupId, position } });
  }
}
