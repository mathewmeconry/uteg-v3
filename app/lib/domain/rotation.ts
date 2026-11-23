export type DivisionState = 'PENDING' | 'RUNNING' | 'ENDED';

type RotationEntry = { withdrawnAt: Date | null };

export type RotationDivision<Entry extends RotationEntry> = {
  id: string;
  category: string;
  number: number;
  state: DivisionState;
  startedAt: Date | null;
  /** Apparatus in rotation order. Also the number of rounds. */
  apparatus: readonly string[];
  /** The ordered entries by the apparatus they start on. */
  lineups: Partial<Record<string, Entry[]>>;
};

/**
 * Where the lineup started that is on `apparatus` in `round` (0-based). Null when the division
 * does not use the apparatus or has fewer rounds.
 */
export function startApparatus(apparatusList: readonly string[], apparatus: string, round: number) {
  const index = apparatusList.indexOf(apparatus);
  const count = apparatusList.length;
  if (index === -1 || round < 0 || round >= count) return null;
  return apparatusList[(index - round + count) % count];
}

/** Rotates left: whoever started first goes last on the next apparatus. */
export function rollList<T>(list: readonly T[], round: number): T[] {
  if (list.length === 0) return [];
  const offset = round % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

/** An entry withdrawn after the start keeps its slot, so the order of the others stays the same. */
export function isVisible(
  entry: RotationEntry,
  division: Pick<RotationDivision<RotationEntry>, 'state' | 'startedAt'>,
) {
  if (!entry.withdrawnAt) return true;
  if (division.state === 'PENDING' || !division.startedAt) return false;
  return entry.withdrawnAt >= division.startedAt;
}

type DivisionOrder = { id: string; category: string; number: number };

/** The id only makes the order stable, e.g. for women and men of the same category. */
export function compareDivisions(a: DivisionOrder, b: DivisionOrder) {
  return (
    compareStrings(a.category, b.category) || a.number - b.number || compareStrings(a.id, b.id)
  );
}

/** Everyone on `apparatus` in `round`, in starting order, merged over the divisions. */
export function getRoundList<Entry extends RotationEntry>(
  divisions: readonly RotationDivision<Entry>[],
  apparatus: string,
  round: number,
): Entry[] {
  const merged = divisions.toSorted(compareDivisions).flatMap((division) => {
    const start = startApparatus(division.apparatus, apparatus, round);
    const entries = start === null ? [] : (division.lineups[start] ?? []);
    return entries.filter((entry) => isVisible(entry, division));
  });
  return rollList(merged, round);
}

/** The number of rounds on an apparatus, 0 when no division uses it. */
export function getRoundCount(
  divisions: readonly { apparatus: readonly string[] }[],
  apparatus: string,
) {
  const counts = divisions
    .filter((division) => division.apparatus.includes(apparatus))
    .map((division) => division.apparatus.length);
  return Math.max(0, ...counts);
}

/** The lists of all rounds on an apparatus. */
export function getRoundSchedule<Entry extends RotationEntry>(
  divisions: readonly RotationDivision<Entry>[],
  apparatus: string,
): Entry[][] {
  return Array.from({ length: getRoundCount(divisions, apparatus) }, (_, round) =>
    getRoundList(divisions, apparatus, round),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function compareStrings(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
