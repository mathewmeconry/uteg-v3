import { countDivisions, findMerges, proposeLineups } from '~/lib/domain/divisionProposal';
import { planGrounds } from '~/lib/domain/groundPlan';
import type { Sex } from '~/modules/types';
import {
  equalCounts,
  groupEntries,
  toLineups,
  usedApparatus,
  type ProposalEntry,
  type ProposedDivision,
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

/** Divisions that run at the same time on the same ground. */
type Unit = Pick<ProposedDivision, 'category' | 'sex' | 'lineups'>[];

/** The divisions of all categories, in running order. */
export function createFullProposal(
  { entries, categories, apparatus, sexes, due, numbers }: FullProposalData,
  options: FullProposalOptions,
): ProposedDivision[] {
  const groups = sexes.flatMap((sex) =>
    proposeUnits(groupEntries(entries, categories, sex), sex, apparatus[sex], options),
  );
  const plan = planGrounds(
    groups.map((units) =>
      units.map((unit) =>
        unit
          .flatMap(({ lineups }) => lineups)
          .flatMap(({ members }) => members.map(({ clubId }) => clubId)),
      ),
    ),
    due,
    options.keepTogether,
  );

  const lastNumbers = { ...numbers };
  return plan.flatMap(({ group, division, ground, slot }) =>
    groups[group][division].map((part) => {
      const key = `${part.category} ${part.sex}`;
      lastNumbers[key] = (lastNumbers[key] ?? 0) + 1;
      return { ...part, number: lastNumbers[key], ground: ground + 1, slot };
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
    const units: Unit[] = own.map((members) => [
      { category, sex, lineups: toLineups(members, apparatus) },
    ]);
    const merged = merges.filter((rests) => rests.at(-1)?.group === group);
    return [units, ...merged.map((rests) => [mergeRests(rests)])];
  });

  function mergeRests(rests: { group: number; lineups: number }[]): Unit {
    let next = 0;
    return rests.map(({ group, lineups }) => {
      const used = apparatus.slice(next, next + lineups);
      next += lineups;
      const { category } = groups[group];
      return { category, sex, lineups: toLineups(divisions[group].at(-1) ?? [], used) };
    });
  }
}
