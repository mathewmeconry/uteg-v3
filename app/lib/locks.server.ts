import { Prisma } from '~/generated/prisma/client';
import { DomainError } from './errors';

// Always lock in this order: competition, athletes, divisions. NO KEY UPDATE does not block
// inserts that only reference the row.

/** Serialises changes to the competition's starters, divisions and members. */
export async function lockCompetition(tx: Prisma.TransactionClient, competitionId: string) {
  const rows = await tx.$queryRaw<{ id: string; grounds: number }[]>`
    SELECT id, grounds FROM competition WHERE id = ${competitionId} FOR NO KEY UPDATE`;
  if (rows.length === 0) throw new DomainError('NOT_FOUND');
  return rows[0];
}

/** Athletes are shared by all competitions, so matching and creating them takes turns. */
export async function lockAthletes(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('athlete'))`;
}

/** For changing the config of a contest. Waits for everyone who computes with it. */
export async function lockContest(tx: Prisma.TransactionClient, contestId: string) {
  await tx.$executeRaw`SELECT id FROM contest WHERE id = ${contestId} FOR NO KEY UPDATE`;
}

/**
 * Keeps the state, lineups and progress of divisions still. Locked in one order, so transactions
 * locking several cannot block each other. Without ids all divisions of the competition. SHARE is
 * for those who only rely on them and may work at the same time, like judges entering grades.
 */
export async function lockDivisions(
  tx: Prisma.TransactionClient,
  competitionId: string,
  ids?: readonly string[],
  mode: 'NO KEY UPDATE' | 'SHARE' = 'NO KEY UPDATE',
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT division.id FROM division
    JOIN contest ON contest.id = division."contestId"
    WHERE contest."competitionId" = ${competitionId}
      AND (${!ids} OR division.id = ANY(${[...(ids ?? [])]}::text[]))
    ORDER BY division.id
    FOR ${Prisma.raw(mode)} OF division`;
  if (ids && rows.length !== new Set(ids).size) throw new DomainError('NOT_FOUND');
}
