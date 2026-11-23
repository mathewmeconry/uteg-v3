type Slot = { entryId: string; withdrawn: boolean; grade: { value: number } | null };

/**
 * The last starter before the first one without a grade, and who comes next. Before the first
 * grade that is the first starter, without a grade.
 */
export function selectStarters<Item extends Slot>(slots: readonly Item[]) {
  const starters = slots.filter(({ withdrawn }) => !withdrawn);
  const open = starters.findIndex(({ grade }) => grade === null);
  const last = open === -1 ? starters.length - 1 : open - 1;
  const index = Math.max(last, 0);
  return { current: starters[index] ?? null, next: starters[index + 1] ?? null };
}

/** On wide screens. More than three rows would make the names too small. */
export function getColumns(count: number) {
  return count > 3 ? 2 : 1;
}
