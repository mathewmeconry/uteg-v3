type Slot = { entryId: string; withdrawn: boolean; grade: { value: number } | null };
type Live = {
  round: number;
  divisionIds: readonly string[];
  apparatus: readonly { apparatus: string; rounds: readonly (readonly Slot[])[] }[];
};

/** How many grades of the round each apparatus shows, and since when the last of them. */
export type Shown = {
  round: number;
  divisionIds: readonly string[];
  steps: Readonly<Record<string, { count: number; since: number }>>;
};

/** How long every grade can be read. */
const HOLD_MS = 30_000;

/** The grades in the order of the starters, up to the first one without. */
export function countGrades(slots: readonly Slot[]) {
  const starters = slots.filter(({ withdrawn }) => !withdrawn);
  const open = starters.findIndex(({ grade }) => grade === null);
  return open === -1 ? starters.length : open;
}

/**
 * The starter with the last of the first `count` grades, and who comes next. Before the first grade
 * that is the first starter, without a grade.
 */
export function selectStarters<Item extends Slot>(slots: readonly Item[], count: number) {
  const starters = slots.filter(({ withdrawn }) => !withdrawn);
  const index = Math.max(Math.min(count, countGrades(slots)) - 1, 0);
  return { current: starters[index] ?? null, next: starters[index + 1] ?? null };
}

/** Everything there is, at once: after a load and for other divisions. */
export function showAll({ round, divisionIds, apparatus }: Live, now: number): Shown {
  const steps = apparatus.map(({ apparatus: key, rounds }) => [
    key,
    { count: countGrades(rounds[round] ?? []), since: now },
  ]);
  return { round, divisionIds, steps: Object.fromEntries(steps) };
}

/**
 * What to show next. New grades follow one after the other, each can be read for a while, and the
 * next round starts after the last of them. Returns the same object when nothing changes.
 */
export function advance(shown: Shown, live: Live, now: number): Shown {
  const isSameCompetitors = live.divisionIds.some((id) => shown.divisionIds.includes(id));
  if (!isSameCompetitors || live.round < shown.round) {
    const isSame =
      live.round === shown.round && live.divisionIds.join() === shown.divisionIds.join();
    return isSame ? shown : showAll(live, now);
  }

  let isDone = true;
  let { steps } = shown;
  for (const { apparatus, rounds } of live.apparatus) {
    const total = countGrades(rounds[shown.round] ?? []);
    const { count, since } = steps[apparatus] ?? { count: total, since: now };
    const isRead = count === 0 || now - since >= HOLD_MS;
    const next = count > total ? total : count < total && isRead ? count + 1 : count;
    if (next !== count || !(apparatus in steps)) {
      steps = { ...steps, [apparatus]: { count: next, since: now } };
    }
    if (next !== total || (next > 0 && (next !== count || !isRead))) isDone = false;
  }

  if (isDone && live.round > shown.round) {
    const empty = live.apparatus.map(({ apparatus }) => [apparatus, { count: 0, since: now }]);
    return { ...shown, round: live.round, steps: Object.fromEntries(empty) };
  }
  const isSameDivisions = live.divisionIds.join() === shown.divisionIds.join();
  return steps === shown.steps && isSameDivisions
    ? shown
    : { ...shown, divisionIds: live.divisionIds, steps };
}

/** On wide screens. More than three rows would make the names too small. */
export function getColumns(count: number) {
  return count > 3 ? 2 : 1;
}
