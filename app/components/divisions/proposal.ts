import { findClashes } from '~/lib/domain/groundPlan';
import type { Sex } from '~/modules/types';

export type ProposalEntry = {
  id: string;
  category: string | null;
  sex: Sex;
  clubId: string;
  clubName: string;
};

export type ProposedDivision = {
  category: string;
  sex: Sex;
  number: number;
  /** 1-based. */
  ground: number;
  /** Divisions with the same one are due at the same time. */
  slot: number;
  lineups: { apparatus: string; members: ProposalEntry[] }[];
};

/** A lineup of a proposed division, see getKey. */
export type LineupRef = { division: string; apparatus: string };

/** A club, or the part of it in one lineup, that goes to another lineup of the category. */
export type ClubMove = { clubId: string; from: LineupRef; to: LineupRef };

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

export function toLineups(members: ProposalEntry[][], apparatus: readonly string[]) {
  return members.map((members, index) => ({ apparatus: apparatus[index], members }));
}

type DivisionName = Pick<ProposedDivision, 'category' | 'sex' | 'number'>;

export function getKey({ category, sex, number }: DivisionName) {
  return `${category} ${sex} ${number}`;
}

export function isSameCategory(a: DivisionName, b: DivisionName) {
  return a.category === b.category && a.sex === b.sex;
}

/** The parts of the clubs in a lineup. */
export function groupClubs(members: readonly ProposalEntry[]) {
  return [...Map.groupBy(members, ({ clubId }) => clubId)].map(([clubId, members]) => ({
    clubId,
    clubName: members[0].clubName,
    count: members.length,
  }));
}

export function applyMoves(divisions: readonly ProposedDivision[], moves: readonly ClubMove[]) {
  return moves.reduce((current, { clubId, from, to }) => {
    const isAt = (ref: LineupRef, key: string, apparatus: string) =>
      ref.division === key && ref.apparatus === apparatus;
    const moved = current
      .filter((division) => getKey(division) === from.division)
      .flatMap(({ lineups }) => lineups)
      .filter(({ apparatus }) => apparatus === from.apparatus)
      .flatMap(({ members }) => members)
      .filter((member) => member.clubId === clubId);
    return current.map((division) => {
      const key = getKey(division);
      return {
        ...division,
        lineups: division.lineups.map(({ apparatus, members }) => {
          if (isAt(from, key, apparatus)) {
            members = members.filter((member) => member.clubId !== clubId);
          }
          if (isAt(to, key, apparatus)) {
            // After those of the club that are already there.
            const all = Map.groupBy([...members, ...moved], (member) => member.clubId);
            members = [...all.values()].flat();
          }
          return { apparatus, members };
        }),
      };
    });
  }, divisions);
}

/**
 * The apparatus of the lineup for a club that comes into the division: where the club already is, if
 * it fits, or the smallest one.
 */
export function chooseLineup(
  { lineups }: ProposedDivision,
  { clubId, count }: { clubId: string; count: number },
  maxSize: number,
) {
  const own = lineups.find(
    ({ members }) =>
      members.length + count <= maxSize && members.some((member) => member.clubId === clubId),
  );
  const [smallest] = lineups.toSorted(
    (a, b) =>
      a.members.length - b.members.length ||
      groupClubs(a.members).length - groupClubs(b.members).length,
  );
  return (own ?? smallest).apparatus;
}

/** Empty divisions are not created, so they get no number. */
function numberDivisions(divisions: readonly ProposedDivision[]) {
  const next = new Map<string, number>();
  return divisions.map((division) => {
    const category = `${division.category} ${division.sex}`;
    // The numbers of a category go up.
    const number = next.get(category) ?? division.number;
    const isEmpty = isEmptyDivision(division);
    next.set(category, isEmpty ? number : number + 1);
    return { ...division, key: getKey(division), number, isEmpty };
  });
}

function isEmptyDivision({ lineups }: ProposedDivision) {
  return lineups.every(({ members }) => members.length === 0);
}

/** What to point out about each division. */
export function describeDivisions(proposed: readonly ProposedDivision[]) {
  const divisions = numberDivisions(proposed);
  const clashes = findClashes(
    divisions.map(({ ground, slot, lineups }) => ({
      ground,
      slot,
      clubs: new Set(lineups.flatMap(({ members }) => members).map(({ clubId }) => clubId)),
    })),
  );
  const clubNames = new Map(
    divisions
      .flatMap(({ lineups }) => lineups.flatMap(({ members }) => members))
      .map(({ clubId, clubName }) => [clubId, clubName]),
  );
  return divisions.map((division, index) => ({
    ...division,
    clashes: clashes[index].map((club) => clubNames.get(club) ?? ''),
    split: findSplitClubs(
      division,
      divisions.filter((other) => isSameCategory(other, division)),
    ),
    /** Merged small divisions. */
    together: divisions.filter(
      (other) =>
        other !== division &&
        !other.isEmpty &&
        !division.isEmpty &&
        other.ground === division.ground &&
        other.slot === division.slot,
    ),
  }));
}

export type DescribedDivision = ReturnType<typeof describeDivisions>[number];

/** For the action: the ids of the entries by apparatus, without empty divisions. */
export function toFormData(divisions: readonly ProposedDivision[]) {
  return divisions
    .filter((division) => !isEmptyDivision(division))
    .map(({ category, sex, ground, lineups }) => ({
      category,
      sex,
      ground,
      lineups: Object.fromEntries(
        lineups.map(({ apparatus, members }) => [apparatus, members.map(({ id }) => id)]),
      ),
    }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The clubs of the division that are in several lineups of the category. */
function findSplitClubs(division: ProposedDivision, category: readonly ProposedDivision[]) {
  const members = division.lineups.flatMap((lineup) => lineup.members);
  return groupClubs(members)
    .map(({ clubId, clubName }) => ({
      clubName,
      lineups: category.flatMap(({ number, lineups }) =>
        lineups
          .map(({ apparatus, members }) => ({
            number,
            apparatus,
            count: members.filter((member) => member.clubId === clubId).length,
          }))
          .filter(({ count }) => count > 0),
      ),
    }))
    .filter(({ lineups }) => lineups.length > 1);
}
