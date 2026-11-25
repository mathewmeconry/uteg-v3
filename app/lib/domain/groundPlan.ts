/** The clubs of each division of a category. */
type Group = readonly (readonly string[])[];

type Place = {
  /** 0-based. */
  ground: number;
  /** How many divisions of the ground are due before. */
  slot: number;
};

export type PlannedDivision = Place & {
  /** Indexes of the category and its division. */
  group: number;
  division: number;
};

/** The clubs of each division that are on another ground at the same time. */
export function findClashes(divisions: readonly (Place & { clubs: ReadonlySet<string> })[]) {
  return divisions.map(({ ground, slot, clubs }) => {
    const others = divisions.filter((other) => other.slot === slot && other.ground !== ground);
    return [...clubs].filter((club) => others.some((other) => other.clubs.has(club)));
  });
}

/**
 * The running order of the divisions, with about equally many per ground and few clubs on two
 * grounds at the same time. Categories follow each other, or stay on one ground with `keepTogether`.
 * Assumes that all divisions take equally long. `occupied` is how many are already due per ground.
 */
export function planGrounds(
  groups: readonly Group[],
  occupied: readonly number[],
  keepTogether: boolean,
): PlannedDivision[] {
  const places = keepTogether ? placeTogether(groups, occupied) : placeFreely(groups, occupied);
  // Which division is at each place of its category.
  const orders = groups.map((group) => group.map((_, index) => index));

  const bySlot = Map.groupBy(
    places.flatMap((own, group) => own.map((place, position) => ({ ...place, group, position }))),
    ({ slot }) => slot,
  );
  const clubsAt = (group: number, position: number) => groups[group][orders[group][position]];

  function countClashes(group: number, position: number) {
    const { ground, slot } = places[group][position];
    const others = new Set(
      (bySlot.get(slot) ?? [])
        .filter((other) => other.ground !== ground)
        .flatMap((other) => clubsAt(other.group, other.position)),
    );
    return [...new Set(clubsAt(group, position))].filter((club) => others.has(club)).length;
  }

  let improved: boolean;
  do {
    improved = false;
    for (const [group, order] of orders.entries()) {
      for (let a = 0; a < order.length; a++) {
        for (let b = a + 1; b < order.length; b++) {
          // Nothing changes between places at the same time.
          if (places[group][a].slot === places[group][b].slot) continue;
          const count = () => countClashes(group, a) + countClashes(group, b);
          const before = count();
          [order[a], order[b]] = [order[b], order[a]];
          if (count() < before) improved = true;
          else [order[a], order[b]] = [order[b], order[a]];
        }
      }
    }
  } while (improved);

  return orders
    .flatMap((order, group) =>
      order.map((division, position) => ({
        ...places[group][position],
        group,
        division,
      })),
    )
    .sort((a, b) => a.slot - b.slot || a.ground - b.ground);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Each category on one ground: the largest first, on the ground with the fewest divisions. */
function placeTogether(groups: readonly Group[], occupied: readonly number[]): Place[][] {
  const counts = [...occupied];
  const grounds: number[] = [];
  const bySize = [...groups.entries()].sort(([, a], [, b]) => b.length - a.length);
  for (const [index, { length }] of bySize) {
    const ground = findFewest(counts);
    grounds[index] = ground;
    counts[ground] += length;
  }
  const next = [...occupied];
  return groups.map((group, index) =>
    group.map(() => ({ ground: grounds[index], slot: next[grounds[index]]++ })),
  );
}

/** Each division on the ground that is free first. */
function placeFreely(groups: readonly Group[], occupied: readonly number[]): Place[][] {
  const next = [...occupied];
  return groups.map((group) =>
    group.map(() => {
      const ground = findFewest(next);
      return { ground, slot: next[ground]++ };
    }),
  );
}

function findFewest(counts: readonly number[]) {
  return counts.indexOf(Math.min(...counts));
}
