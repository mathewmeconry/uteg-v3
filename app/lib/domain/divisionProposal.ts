type Member = { clubId: string };
type Block = { clubId: string; size: number };

type Options = {
  /** How many lineups each division has. */
  lineupCounts: readonly number[];
  maxSize: number;
};

// How bad something is, compared with a division that has one starter per lineup too many (1).
const ABOVE_MAX = 1000;
const THIRD_CLUB = 3;
const CLUB_IN_OTHER_DIVISION = 10;
/** The others of the division have to wait for a large lineup. */
const UNEVEN_LINEUP = 4;

/** How much larger than another one of its division a lineup may be before clubs are split. */
const MAX_DIFFERENCE = 2;

/**
 * Distributes starters over new divisions and their lineups, with whole clubs and few clubs per
 * lineup. The lineups of a division are equally large, divisions may differ. Clubs are only split
 * when they do not fit or for lineups that are more even, in the order of the members. The same
 * members always give the same result. Null when they cannot fit.
 */
export function proposeLineups<T extends Member>(
  members: readonly T[],
  { lineupCounts, maxSize }: Options,
): T[][][] | null {
  const count = countLineups(lineupCounts);
  if (count < 1 || members.length > count * maxSize) return null;

  const clubs = Map.groupBy(members, ({ clubId }) => clubId);
  let blocks = [...clubs]
    .flatMap(([clubId, { length }]) =>
      splitEvenly(length, Math.ceil(length / maxSize)).map((size) => ({ clubId, size })),
    )
    .sort((a, b) => b.size - a.size);
  let places: number[];
  for (;;) {
    places = distribute(blocks, lineupCounts, maxSize);
    const sizes = sumSizes(blocks, places, count);
    // The first one is the largest. With single starters everybody fits.
    const index = blocks.findIndex(({ size }, index) => size > 1 && sizes[places[index]] > maxSize);
    if (index < 0) break;
    blocks = splitBlock(blocks, index);
  }

  for (;;) {
    const better = findBetterSplit(blocks, places, lineupCounts, maxSize);
    if (!better) return toDivisions(clubs, blocks, places, lineupCounts);
    ({ blocks, places } = better);
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

function splitBlock(blocks: readonly Block[], index: number) {
  const { clubId, size } = blocks[index];
  const halves = splitEvenly(size, 2).map((half) => ({ clubId, size: half }));
  return blocks.toSpliced(index, 1, ...halves).sort((a, b) => b.size - a.size);
}

/** By how much lineups are too large or small for their division, over all divisions. */
function getUnevenness(sizes: readonly number[], lineupCounts: readonly number[], maxSize: number) {
  let start = 0;
  let sum = 0;
  for (const lineups of lineupCounts) {
    const own = sizes.slice(start, start + lineups);
    start += lineups;
    sum += Math.max(0, Math.max(...own) - Math.min(...own) - MAX_DIFFERENCE);
    if (Math.max(...own) > maxSize) return Infinity;
  }
  return sum;
}

/** The club to split, without leaving anybody alone, that makes uneven divisions the most even. */
function findBetterSplit(
  blocks: readonly Block[],
  places: readonly number[],
  lineupCounts: readonly number[],
  maxSize: number,
) {
  const getScore = (blocks: readonly Block[], places: readonly number[]) =>
    getUnevenness(sumSizes(blocks, places, countLineups(lineupCounts)), lineupCounts, maxSize);
  let best = getScore(blocks, places);
  let better: { blocks: Block[]; places: number[] } | null = null;
  if (best === 0) return null;
  const tried = new Set<string>();
  for (const [index, { clubId, size }] of blocks.entries()) {
    // Whole clubs of the same size give the same.
    const isWhole = blocks.filter((block) => block.clubId === clubId).length === 1;
    const key = `${size} ${isWhole ? '' : clubId}`;
    if (size < 4 || tried.has(key)) continue;
    tried.add(key);
    const newBlocks = splitBlock(blocks, index);
    const newPlaces = distribute(newBlocks, lineupCounts, maxSize);
    const score = getScore(newBlocks, newPlaces);
    if (score < best) {
      best = score;
      better = { blocks: newBlocks, places: newPlaces };
    }
  }
  return better;
}

function countLineups(lineupCounts: readonly number[]) {
  return lineupCounts.reduce((sum, lineups) => sum + lineups, 0);
}

/** The lineup of each block: the emptiest first, then moves and swaps as long as they improve it. */
function distribute(
  blocks: readonly Block[],
  lineupCounts: readonly number[],
  maxSize: number,
): number[] {
  const divisionOf: number[] = [];
  const lineupsOf = lineupCounts.map((lineups, division) =>
    Array.from({ length: lineups }, () => divisionOf.push(division) - 1),
  );
  const count = divisionOf.length;
  const average = blocks.reduce((sum, { size }) => sum + size, 0) / count;
  const places: number[] = [];
  const sizes = Array.from({ length: count }, () => 0);
  const blockCounts = Array.from({ length: count }, () => 0);
  const blocksOfClub = Map.groupBy(blocks.keys(), (index) => blocks[index].clubId);

  for (const index of blocks.keys()) put(index, sizes.indexOf(Math.min(...sizes)));

  let improved: boolean;
  do {
    improved = false;
    for (let a = 0; a < blocks.length; a++) {
      for (let place = 0; place < count; place++) {
        if (places[a] !== place) improve([a], [place]);
      }
      for (let b = a + 1; b < blocks.length; b++) {
        if (places[a] !== places[b]) improve([a, b], [places[b], places[a]]);
      }
    }
  } while (improved);
  return places;

  /** Only looks at what the change affects. */
  function improve(indexes: number[], to: number[]) {
    const from = indexes.map((index) => places[index]);
    const divisions = new Set([...from, ...to].map((place) => divisionOf[place]));
    const getCost = () => {
      let cost = 0;
      for (const division of divisions) cost += getDivisionCost(division);
      for (const index of indexes) cost += getClubCost(blocks[index].clubId);
      return cost;
    };
    const before = getCost();
    move(indexes, to);
    // Not because of rounding.
    if (getCost() < before - 1e-6) improved = true;
    else move(indexes, from);
  }

  function move(indexes: readonly number[], to: readonly number[]) {
    for (const index of indexes) {
      sizes[places[index]] -= blocks[index].size;
      blockCounts[places[index]]--;
    }
    for (const [position, index] of indexes.entries()) put(index, to[position]);
  }

  function put(index: number, place: number) {
    places[index] = place;
    sizes[place] += blocks[index].size;
    blockCounts[place]++;
  }

  function getSize(division: number) {
    let size = 0;
    for (const place of lineupsOf[division]) size += sizes[place];
    return size;
  }

  function getDivisionCost(division: number) {
    const lineups = lineupCounts[division];
    const size = getSize(division);
    let cost = (size - average * lineups) ** 2 / lineups;
    for (const place of lineupsOf[division]) {
      cost += UNEVEN_LINEUP * (sizes[place] - size / lineups) ** 2;
      cost += ABOVE_MAX * Math.max(0, sizes[place] - maxSize);
      cost += THIRD_CLUB * Math.max(0, blockCounts[place] - 2);
    }
    return cost;
  }

  function getClubCost(clubId: string) {
    const own = blocksOfClub.get(clubId) ?? [];
    const others = own.filter((index) => divisionOf[places[index]] !== divisionOf[places[own[0]]]);
    return CLUB_IN_OTHER_DIVISION * others.length;
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
