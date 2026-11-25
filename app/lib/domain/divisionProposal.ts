type Member = { clubId: string };
type Block = { clubId: string; size: number };

type Options = {
  /** How many lineups each division has. */
  lineupCounts: readonly number[];
  maxSize: number;
};

// How bad something is, compared with a lineup that is one starter too large or small (1).
const ABOVE_MAX = 1000;
const THIRD_CLUB = 3;
const CLUB_IN_OTHER_DIVISION = 10;

/**
 * Distributes starters over new divisions and their lineups: equally large, with whole clubs and few
 * clubs per lineup. Clubs are only split when they do not fit, in the order of the members. The
 * same members always give the same result. Null when they cannot fit.
 */
export function proposeLineups<T extends Member>(
  members: readonly T[],
  { lineupCounts, maxSize }: Options,
): T[][][] | null {
  const count = lineupCounts.reduce((sum, lineups) => sum + lineups, 0);
  if (count < 1 || members.length > count * maxSize) return null;

  const clubs = Map.groupBy(members, ({ clubId }) => clubId);
  let blocks = [...clubs].flatMap(([clubId, { length }]) =>
    splitEvenly(length, Math.ceil(length / maxSize)).map((size) => ({ clubId, size })),
  );
  for (;;) {
    blocks = blocks.toSorted((a, b) => b.size - a.size);
    const places = distribute(blocks, lineupCounts, maxSize);
    const sizes = sumSizes(blocks, places, count);
    // The first one is the largest. With single starters everybody fits.
    const index = blocks.findIndex(({ size }, index) => size > 1 && sizes[places[index]] > maxSize);
    if (index < 0) return toDivisions(clubs, blocks, places, lineupCounts);
    const { clubId, size } = blocks[index];
    const halves = splitEvenly(size, 2).map((half) => ({ clubId, size: half }));
    blocks = blocks.toSpliced(index, 1, ...halves);
  }
}

/** How many divisions are needed for lineups of about this size. */
export function countDivisions(members: number, lineupCount: number, size: number) {
  return Math.max(1, Math.ceil(members / (lineupCount * size)));
}

/**
 * Which divisions with few lineups fit together on `capacity` apparatus, by their indexes. Those that
 * stay alone are left out.
 */
export function findMerges(lineupCounts: readonly number[], capacity: number): number[][] {
  const merges: { free: number; indexes: number[] }[] = [];
  const bySize = [...lineupCounts.entries()].sort(([, a], [, b]) => b - a);
  for (const [index, lineups] of bySize) {
    const merge = merges.find(({ free }) => free >= lineups);
    if (merge) {
      merge.free -= lineups;
      merge.indexes.push(index);
    } else {
      merges.push({ free: capacity - lineups, indexes: [index] });
    }
  }
  return merges
    .filter(({ indexes }) => indexes.length > 1)
    .map(({ indexes }) => indexes.sort((a, b) => a - b));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitEvenly(total: number, parts: number) {
  return Array.from({ length: parts }, (_, index) => Math.floor((total + index) / parts));
}

function sumSizes(blocks: readonly Block[], places: readonly number[], count: number) {
  const sizes = Array.from({ length: count }, () => 0);
  for (const [index, { size }] of blocks.entries()) sizes[places[index]] += size;
  return sizes;
}

/** The lineup of each block: the emptiest first, then moves and swaps as long as they improve it. */
function distribute(
  blocks: readonly Block[],
  lineupCounts: readonly number[],
  maxSize: number,
): number[] {
  // By lineup.
  const divisionOf = lineupCounts.flatMap((lineups, division) =>
    Array.from({ length: lineups }, () => division),
  );
  const count = divisionOf.length;
  const places: number[] = [];
  const sizes = Array.from({ length: count }, () => 0);
  for (const { size } of blocks) {
    const place = sizes.indexOf(Math.min(...sizes));
    places.push(place);
    sizes[place] += size;
  }

  let best = getCost();
  let improved: boolean;
  do {
    improved = false;
    for (let a = 0; a < blocks.length; a++) {
      for (let place = 0; place < count; place++) improve(() => (places[a] = place), a);
      for (let b = a + 1; b < blocks.length; b++) {
        if (places[a] === places[b]) continue;
        improve(() => ([places[a], places[b]] = [places[b], places[a]]), a, b);
      }
    }
  } while (improved);
  return places;

  function improve(change: () => void, a: number, b = a) {
    const before = [places[a], places[b]];
    change();
    const cost = getCost();
    if (cost < best) {
      best = cost;
      improved = true;
    } else {
      [places[a], places[b]] = before;
    }
  }

  function getCost() {
    const total = sumSizes(blocks, places, count);
    const average = blocks.reduce((sum, { size }) => sum + size, 0) / count;
    const blockCounts = Array.from({ length: count }, () => 0);
    const divisionsOfClubs = new Map<string, number>();
    let cost = 0;
    for (const [index, { clubId }] of blocks.entries()) {
      blockCounts[places[index]]++;
      const division = divisionOf[places[index]];
      const first = divisionsOfClubs.get(clubId);
      if (first === undefined) divisionsOfClubs.set(clubId, division);
      else if (first !== division) cost += CLUB_IN_OTHER_DIVISION;
    }
    const divisionSizes = lineupCounts.map(() => 0);
    for (const [place, size] of total.entries()) {
      divisionSizes[divisionOf[place]] += size;
      cost += (size - average) ** 2 + ABOVE_MAX * Math.max(0, size - maxSize);
      cost += THIRD_CLUB * Math.max(0, blockCounts[place] - 2);
    }
    for (const [division, lineups] of lineupCounts.entries()) {
      cost += (divisionSizes[division] - average * lineups) ** 2 / lineups;
    }
    return cost;
  }
}

function toDivisions<T extends Member>(
  clubs: ReadonlyMap<string, readonly T[]>,
  blocks: readonly Block[],
  places: readonly number[],
  lineupCounts: readonly number[],
): T[][][] {
  const divisions = lineupCounts.map((length) => Array.from({ length }, (): T[] => []));
  const allLineups = divisions.flat();
  const used = new Map<string, number>();
  for (const [index, { clubId, size }] of blocks.entries()) {
    const start = used.get(clubId) ?? 0;
    used.set(clubId, start + size);
    const members = clubs.get(clubId) ?? [];
    allLineups[places[index]].push(...members.slice(start, start + size));
  }
  // Halves of a club may be in the same lineup, with another club between them.
  return divisions.map((lineups) =>
    lineups.map((lineup) => [...Map.groupBy(lineup, ({ clubId }) => clubId).values()].flat()),
  );
}
