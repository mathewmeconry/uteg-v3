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

export function toEntryIds(
  lineups: readonly (readonly ProposalEntry[])[],
  apparatus: readonly string[],
) {
  return Object.fromEntries(
    lineups.map((lineup, index) => [apparatus[index], lineup.map(({ id }) => id)]),
  );
}
