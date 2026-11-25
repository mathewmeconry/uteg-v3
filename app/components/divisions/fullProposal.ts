import { countDivisions, findMerges, proposeLineups } from '~/lib/domain/divisionProposal';
import { planGrounds } from '~/lib/domain/groundPlan';
import type { Sex } from '~/modules/types';
import {
  equalCounts,
  findSplitClubs,
  groupEntries,
  toEntryIds,
  usedApparatus,
  type ProposalEntry,
  type ProposalGroup,
} from './proposal';

export type FullProposalData = {
  entries: readonly ProposalEntry[];
  categories: Record<Sex, readonly string[]>;
  apparatus: Record<Sex, readonly string[]>;
  sexes: readonly Sex[];
  /** The divisions that are already due, by ground. */
  due: readonly number[];
  /** The highest number of the divisions there are, by category and sex. */
  numbers: Record<string, number>;
};

export type FullProposalOptions = {
  size: number;
  maxSize: number;
  keepTogether: boolean;
  mergeSmall: boolean;
};

type Part = {
  category: string;
  sex: Sex;
  apparatus: readonly string[];
  lineups: ProposalEntry[][];
};

/** Divisions that run at the same time on the same ground. */
type Unit = Part[];

/** The divisions of all categories, in running order. */
export function createFullProposal(
  { entries, categories, apparatus, sexes, due, numbers }: FullProposalData,
  options: FullProposalOptions,
) {
  const groups = sexes.flatMap((sex) =>
    proposeUnits(groupEntries(entries, categories, sex), sex, apparatus[sex], options),
  );
  const plan = planGrounds(
    groups.map((units) =>
      units.map((unit) =>
        unit.flatMap(({ lineups }) => lineups.flat().map(({ clubId }) => clubId)),
      ),
    ),
    due,
    options.keepTogether,
  );

  const clubNames = new Map(entries.map(({ clubId, clubName }) => [clubId, clubName]));
  const lastNumbers = { ...numbers };
  const numbered = plan.map(({ group, division, ...place }) => {
    const parts = groups[group][division].map((part) => {
      const key = `${part.category} ${part.sex}`;
      lastNumbers[key] = (lastNumbers[key] ?? 0) + 1;
      return { ...part, key, number: lastNumbers[key] };
    });
    return { ...place, parts };
  });
  const byCategory = Map.groupBy(
    numbered.flatMap(({ parts }) => parts),
    ({ key }) => key,
  );
  const splitClubs = new Map(
    [...byCategory].map(([key, divisions]) => [key, findSplitClubs(divisions)]),
  );

  return numbered.flatMap(({ ground, clashes, parts }) =>
    parts.map(({ category, sex, apparatus, lineups, key, number }) => {
      const clubs = new Set(lineups.flat().map(({ clubId }) => clubId));
      const group: ProposalGroup = {
        category,
        sex,
        ground: ground + 1,
        divisions: [toEntryIds(lineups, apparatus)],
      };
      return {
        group,
        number,
        lineups: lineups.map(({ length }, index) => ({ apparatus: apparatus[index], length })),
        clashes: clashes.filter((club) => clubs.has(club)).map((club) => clubNames.get(club) ?? ''),
        split: splitClubs.get(key)?.get(number) ?? [],
        together: parts
          .filter((other) => other.category !== category)
          .map(({ category, sex, number }) => ({ category, sex, number })),
      };
    }),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The units of each category, followed by those merged from it and categories before. */
function proposeUnits(
  groups: { category: string; members: ProposalEntry[] }[],
  sex: Sex,
  apparatus: readonly string[],
  { size, maxSize, mergeSmall }: FullProposalOptions,
): Unit[][] {
  // The lineups that do not fill a division.
  const rests = groups
    .map(({ members }, group) => ({
      group,
      lineups: Math.ceil(members.length / size) % apparatus.length,
    }))
    .filter(({ lineups }) => lineups > 0);
  const merges = mergeSmall
    ? findMerges(
        rests.map(({ lineups }) => lineups),
        apparatus.length,
      ).map((indexes) => indexes.map((index) => rests[index]))
    : [];
  const restOf = new Map(merges.flat().map((rest) => [rest.group, rest.lineups]));

  const divisions = groups.map(({ members }, group) => {
    const rest = restOf.get(group);
    const used = usedApparatus(apparatus, members.length, size);
    const lineupCounts = rest
      ? [
          ...equalCounts(Math.floor(members.length / size / apparatus.length), apparatus.length),
          rest,
        ]
      : equalCounts(countDivisions(members.length, used.length, size), used.length);
    return proposeLineups(members, { lineupCounts, maxSize }) ?? [];
  });

  return groups.flatMap(({ category }, group) => {
    const own = restOf.has(group) ? divisions[group].slice(0, -1) : divisions[group];
    const units: Unit[] = own.map((lineups) => [{ category, sex, apparatus, lineups }]);
    const merged = merges.filter((rests) => rests.at(-1)?.group === group);
    return [units, ...merged.map((rests) => [mergeRests(rests)])];
  });

  function mergeRests(rests: { group: number; lineups: number }[]): Unit {
    let next = 0;
    return rests.map(({ group, lineups }) => {
      const used = apparatus.slice(next, next + lineups);
      next += lineups;
      const { category } = groups[group];
      return { category, sex, apparatus: used, lineups: divisions[group].at(-1) ?? [] };
    });
  }
}
