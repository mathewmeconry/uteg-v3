import type { Sex } from '~/modules/types';

export type ProposalEntry = {
  id: string;
  category: string | null;
  sex: Sex;
  clubId: string;
  clubName: string;
};

export type ProposalGroup = {
  category: string;
  sex: Sex;
  ground: number;
  /** The ids of the entries by apparatus. */
  divisions: Record<string, string[]>[];
};

export const MAX_DIVISIONS = 30;
export const SIZE = { min: 3, max: 30 };
export const DEFAULT_SIZE = '11';
export const DEFAULT_MAX_SIZE = '12';

export function parseNumber(text: string, { min, max }: { min: number; max: number }) {
  const value = Number(text);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** The categories with somebody in them. */
export function groupEntries(
  entries: readonly ProposalEntry[],
  categories: Record<Sex, readonly string[]>,
  sex: Sex,
) {
  return categories[sex]
    .map((category) => ({
      category,
      members: entries.filter((entry) => entry.sex === sex && entry.category === category),
    }))
    .filter(({ members }) => members.length > 0);
}

/** As many of the apparatus as a small category fills with lineups of about this size. */
export function usedApparatus<T>(apparatus: readonly T[], memberCount: number, size: number) {
  return apparatus.slice(0, Math.ceil(memberCount / size));
}

/** Equally large divisions. */
export function equalCounts(divisionCount: number, lineupCount: number) {
  return Array.from({ length: divisionCount }, () => lineupCount);
}

export type SplitClub = {
  clubName: string;
  lineups: { number: number; apparatus: string; length: number }[];
};

/** By the number of each division of a category: the clubs in it that are in several lineups. */
export function findSplitClubs(
  divisions: readonly {
    number: number;
    apparatus: readonly string[];
    lineups: readonly (readonly ProposalEntry[])[];
  }[],
) {
  const clubs = new Map<string, SplitClub>();
  for (const { number, apparatus, lineups } of divisions) {
    for (const [index, lineup] of lineups.entries()) {
      for (const [clubId, members] of Map.groupBy(lineup, ({ clubId }) => clubId)) {
        const club = clubs.get(clubId) ?? { clubName: members[0].clubName, lineups: [] };
        clubs.set(clubId, club);
        club.lineups.push({ number, apparatus: apparatus[index], length: members.length });
      }
    }
  }
  const split = [...clubs.values()].filter(({ lineups }) => lineups.length > 1);
  return new Map(
    divisions.map(({ number }) => [
      number,
      split.filter(({ lineups }) => lineups.some((lineup) => lineup.number === number)),
    ]),
  );
}

export function toEntryIds(
  lineups: readonly (readonly ProposalEntry[])[],
  apparatus: readonly string[],
) {
  return Object.fromEntries(
    lineups.map((lineup, index) => [apparatus[index], lineup.map(({ id }) => id)]),
  );
}
