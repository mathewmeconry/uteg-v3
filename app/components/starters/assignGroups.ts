import type { StarterRow } from './starterRow';

/** Starters by category and sex, because a division takes one of each. */
export function groupForAssignment(starters: readonly StarterRow[]) {
  const groups = new Map<
    string,
    { key: string; category: string; sex: StarterRow['sex']; entryIds: string[] }
  >();
  let withoutCategory = 0;
  for (const { category, sex, entryId } of starters) {
    if (!category || !entryId) {
      withoutCategory++;
      continue;
    }
    const key = `${category}-${sex}`;
    const group = groups.get(key) ?? { key, category, sex, entryIds: [] };
    group.entryIds.push(entryId);
    groups.set(key, group);
  }
  return {
    groups: [...groups.values()].toSorted((a, b) => (a.key < b.key ? -1 : 1)),
    withoutCategory,
  };
}
