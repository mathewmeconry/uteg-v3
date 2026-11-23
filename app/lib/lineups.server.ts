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
 * Appends entries of the division to a lineup. Also while it runs, e.g. for somebody who came late:
 * what they miss on an apparatus that has already passed is asked for when the division ends, see
 * confirmRound.
 */
export async function moveEntriesToLineup(
  competitionId: string,
  lineupId: string,
  entryIds: string[],
) {
  await prisma.$transaction(async (tx) => {
    const lineup = await lockLineup(tx, competitionId, lineupId);
    await assertInDivision(tx, lineup.divisionId, entryIds);
    const present = new Set(lineup.entries.map(({ id }) => id));
    const added = entryIds.filter((id) => !present.has(id));
    await savePositions(tx, lineupId, added, nextPosition(lineup.entries));
  });
  publish(competitionId, 'divisions');
}

/**
 * Puts a lineup in this order. Entries from elsewhere in the division are moved here, entries that
 * are not listed stay at the end.
 */
export async function setLineupOrder(competitionId: string, lineupId: string, entryIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const lineup = await lockLineup(tx, competitionId, lineupId);
    await assertInDivision(tx, lineup.divisionId, entryIds);
    const rest = lineup.entries.map(({ id }) => id).filter((id) => !entryIds.includes(id));
    await savePositions(tx, lineupId, [...entryIds, ...rest], 0);
  });
  publish(competitionId, 'divisions');
}

export async function unassignEntries(competitionId: string, entryIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const where = { id: { in: entryIds }, contest: { competitionId } };
    const entries = await tx.entry.findMany({ where });
    if (entries.length !== new Set(entryIds).size) throw new DomainError('NOT_FOUND');
    const divisionIds = entries.flatMap(({ divisionId }) => divisionId ?? []);
    await lockDivisions(tx, competitionId, divisionIds);
    await tx.entry.updateMany({ where, data: { lineupId: null } });
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
  if (count !== entryIds.length) throw new DomainError('DIVISION_MISMATCH');
}

async function savePositions(
  tx: Prisma.TransactionClient,
  lineupId: string,
  entryIds: string[],
  start: number,
) {
  for (const [index, id] of entryIds.entries()) {
    await tx.entry.update({ where: { id }, data: { lineupId, position: start + index } });
  }
}
