import { getContestModule } from '~/modules/registry';
import { startApparatus } from './domain/rotation';
import { prisma } from './prisma.server';

export type SearchIndex = Awaited<ReturnType<typeof getSearchIndex>>;

/** Who and what the search finds in a competition. The browser filters, so no name is in a URL. */
export async function getSearchIndex(competitionId: string) {
  const [starters, divisions] = await Promise.all([
    prisma.starter.findMany({
      where: { competitionId, deletedAt: null },
      include: {
        club: true,
        entries: {
          where: { withdrawnAt: null },
          include: { contest: true, division: { include: { apparatus: true } } },
          orderBy: { contest: { position: 'asc' } },
        },
      },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
    }),
    prisma.division.findMany({
      where: { contest: { competitionId } },
      orderBy: [{ category: 'asc' }, { sex: 'asc' }, { number: 'asc' }, { id: 'asc' }],
    }),
  ]);

  return {
    starters: starters.map(({ id, firstname, lastname, sex, club, entries }) => {
      // With several contests the one that is going on, or is next.
      const entry =
        (['RUNNING', 'PENDING', 'ENDED'] as const)
          .map((state) => entries.find(({ division }) => division?.state === state))
          .find((found) => found) ?? entries[0];
      return {
        id,
        name: `${firstname} ${lastname}`,
        sex,
        clubName: club.name,
        contestId: entry?.contestId ?? null,
        category: entry?.category ?? null,
        division: entry?.division && toDivision(entry.division),
        /** Where the person is now, while the division runs. */
        apparatus: entry ? getCurrentApparatus(entry) : null,
      };
    }),
    divisions: divisions.map(toDivision),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Loaded = Awaited<ReturnType<typeof prisma.division.findMany>>[number];

function toDivision({ id, contestId, category, sex, number, ground, state }: Loaded) {
  return { id, contestId, category, sex, number, ground, state };
}

function getCurrentApparatus({
  contest,
  division,
  startApparatus: start,
}: {
  contest: Parameters<typeof getContestModule>[0];
  division: (Loaded & { apparatus: { apparatus: string; completedRounds: number }[] }) | null;
  startApparatus: string | null;
}) {
  if (!start || division?.state !== 'RUNNING') return null;
  const order = getContestModule(contest).apparatus(division.sex);
  const current = division.apparatus
    .filter(
      ({ apparatus, completedRounds }) =>
        startApparatus(order, apparatus, completedRounds) === start,
    )
    // Two, when one apparatus is ahead of the others: the earlier one.
    .toSorted((a, b) => a.completedRounds - b.completedRounds);
  return current[0]?.apparatus ?? null;
}
