import { countDivisions, findMerges, proposeLineups } from './divisionProposal';

/** Members of clubs with these sizes. */
function createMembers(...sizes: number[]) {
  return sizes.flatMap((size, club) =>
    Array.from({ length: size }, (_, index) => ({
      id: `${club}-${index}`,
      clubId: `club${club}`,
    })),
  );
}

function propose(sizes: number[], divisionCount: number, lineupCount: number, maxSize = 12) {
  const lineupCounts = Array.from({ length: divisionCount }, () => lineupCount);
  return proposeLineups(createMembers(...sizes), { lineupCounts, maxSize });
}

function sizesOf(divisions: ReturnType<typeof propose>) {
  return divisions?.map((lineups) => lineups.map(({ length }) => length));
}

describe('proposeLineups', () => {
  it('keeps clubs together and fills the lineups equally', () => {
    const divisions = propose([7, 6, 5, 4, 3, 5, 2, 8], 1, 4);
    expect(sizesOf(divisions)).toEqual([[10, 10, 10, 10]]);
    const lineups = divisions!.flat();
    for (let club = 0; club < 8; club++) {
      const found = lineups.filter((lineup) =>
        lineup.some(({ clubId }) => clubId === `club${club}`),
      );
      expect(found).toHaveLength(1);
    }
  });

  it('has equally large lineups in a division, so that nobody waits', () => {
    const divisions = propose([8, 8, 8, 8, 4, 4, 4, 4], 2, 4);
    expect(sizesOf(divisions)).toEqual([
      [8, 8, 8, 8],
      [4, 4, 4, 4],
    ]);
  });

  it('splits a club when lineups would be too different otherwise', () => {
    const [lineups] = sizesOf(propose([12, 4, 4], 1, 2))!;
    expect(Math.max(...lineups) - Math.min(...lineups)).toBeLessThanOrEqual(2);
    expect(sizesOf(propose([8, 3, 3, 3], 1, 2))).toEqual([[8, 9]]);
  });

  it('does not leave anybody alone to have even lineups', () => {
    expect(sizesOf(propose([3], 1, 2))).toEqual([[3, 0]]);
  });

  it('assigns everybody once and never exceeds the maximum', () => {
    for (const sizes of [[40], [13, 13, 13], [9, 9, 9, 9, 9], [25, 1, 1, 1], [7, 7, 7, 7, 7, 7]]) {
      const members = createMembers(...sizes);
      const lineupCount = Math.ceil(members.length / 12);
      const lineups = propose(sizes, 1, lineupCount)!.flat();
      expect(
        lineups
          .flat()
          .map(({ id }) => id)
          .sort(),
      ).toEqual(members.map(({ id }) => id).sort());
      expect(Math.max(...lineups.map(({ length }) => length))).toBeLessThanOrEqual(12);
    }
  });

  it('splits a club that is too large in the order of its members, in one division', () => {
    const divisions = propose([14, 7, 7, 7, 7, 7, 7], 2, 4)!;
    const withClub = divisions.filter((lineups) =>
      lineups.flat().some(({ clubId }) => clubId === 'club0'),
    );
    expect(withClub).toHaveLength(1);
    const parts = withClub[0]
      .map((lineup) => lineup.filter(({ clubId }) => clubId === 'club0').map(({ id }) => id))
      .filter(({ length }) => length > 0);
    expect(parts.map(({ length }) => length)).toEqual([7, 7]);
    expect(parts.flat()).toEqual(createMembers(14).map(({ id }) => id));
  });

  it('has clubs in one block in a lineup', () => {
    for (const lineup of propose([9, 9, 9, 9, 9], 1, 4)!.flat()) {
      const clubs = lineup.map(({ clubId }) => clubId);
      const runs = clubs.filter((club, index) => club !== clubs[index - 1]);
      expect(runs).toHaveLength(new Set(clubs).size);
    }
  });

  it('is the same every time', () => {
    const sizes = [12, 3, 9, 5, 5, 2, 8, 7, 11, 1, 6];
    expect(propose(sizes, 2, 4)).toEqual(propose(sizes, 2, 4));
  });

  it('is null when they cannot fit', () => {
    expect(propose([49], 1, 4)).toBeNull();
    expect(propose([1], 1, 0)).toBeNull();
    expect(sizesOf(propose([48], 1, 4))).toEqual([[12, 12, 12, 12]]);
  });
});

it('can have a division with fewer lineups', () => {
  const members = createMembers(10, 10, 10, 10, 10, 10);
  const divisions = proposeLineups(members, { lineupCounts: [4, 2], maxSize: 12 });
  expect(sizesOf(divisions)).toEqual([
    [10, 10, 10, 10],
    [10, 10],
  ]);
});

describe('findMerges', () => {
  it.each([
    [[2, 2], [[0, 1]]],
    [[3, 2, 1], [[0, 2]]],
    [
      [1, 3, 2, 2],
      [
        [0, 1],
        [2, 3],
      ],
    ],
    [[3, 3], []],
    [[], []],
  ])('of %j lineups on 4 apparatus are %j', (lineupCounts, expected) => {
    expect(findMerges(lineupCounts, 4).sort()).toEqual(expected);
  });
});

describe('countDivisions', () => {
  it.each([
    [0, 4, 1],
    [44, 4, 1],
    [45, 4, 2],
    [170, 4, 4],
    [213, 4, 5],
  ])('for %i starters in %i lineups of 11 is %i', (members, lineups, expected) => {
    expect(countDivisions(members, lineups, 11)).toBe(expected);
  });
});
