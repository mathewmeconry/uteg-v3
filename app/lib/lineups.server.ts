import type { Prisma } from '~/generated/prisma/client';
import { getContestModule } from '~/modules/registry';
import { isVisible } from './domain/rotation';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockDivisions } from './locks.server';
import { prisma } from './prisma.server';

// A lineup are the entries of a division that start on the same apparatus.
const LINEUP_ORDER = [{ position: 'asc' }, { id: 'asc' }] as const;

/** The division's lineups in rotation order and the entries that are in none. */
export async function getDivisionLineups(competitionId: string, divisionId: string) {
  const division = await prisma.division.findFirst({
    where: { id: divisionId, contest: { competitionId } },
    include: {
      contest: true,
      entries: { orderBy: [...LINEUP_ORDER], include: { starter: { include: { club: true } } } },
    },
  });
  if (!division) throw new DomainError('NOT_FOUND');

  const { contest, entries: allEntries, ...data } = division;
  const entries = allEntries.filter((entry) => isVisible(entry, division));
  return {
    division: data,
    lineups: getContestModule(contest)
      .apparatus(division.sex)
      .map((apparatus) => ({
        apparatus,
        entries: entries.filter((entry) => entry.startApparatus === apparatus),
      })),
    unassigned: entries.filter((entry) => !entry.startApparatus && !entry.withdrawnAt),
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
  lineup: { divisionId: string; apparatus: string },
  entryIds: string[],
  beforeId?: string,
) {
  const { divisionId, apparatus } = lineup;
  await prisma.$transaction(async (tx) => {
    const exists = await tx.divisionApparatus.count({
      where: { divisionId, apparatus, division: { contest: { competitionId } } },
    });
    if (!exists) throw new DomainError('NOT_FOUND');
    await lockDivisions(tx, competitionId, [divisionId]);
    await assertInDivision(tx, divisionId, entryIds);
    const current = await tx.entry.findMany({
      where: { divisionId, startApparatus: apparatus },
      orderBy: [...LINEUP_ORDER],
    });
    const others = current.map(({ id }) => id).filter((id) => !entryIds.includes(id));
    const index = others.findIndex((id) => id === beforeId);
    const ids = others.toSpliced(index < 0 ? Infinity : index, 0, ...entryIds);
    for (const [position, id] of ids.entries()) {
      await tx.entry.update({ where: { id }, data: { startApparatus: apparatus, position } });
    }
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
    await tx.entry.updateMany({ where: { id: { in: entryIds } }, data: { startApparatus: null } });
  });
  publish(competitionId, 'divisions');
}

/** The position after the last entry of a lineup. */
export function nextPosition(entries: { position: number }[]) {
  return Math.max(-1, ...entries.map(({ position }) => position)) + 1;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertInDivision(
  tx: Prisma.TransactionClient,
  divisionId: string,
  entryIds: string[],
) {
  const count = await tx.entry.count({ where: { id: { in: entryIds }, divisionId } });
  if (count !== entryIds.length) throw new DomainError('ENTRY_NOT_IN_DIVISION');
}
