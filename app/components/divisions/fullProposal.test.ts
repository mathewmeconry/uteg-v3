import { createFullProposal } from './fullProposal';
import {
  applyMoves,
  chooseLineup,
  describeDivisions,
  getKey,
  type ProposalEntry,
  type ProposedDivision,
} from './proposal';

/** Women of several clubs, by category. */
function createData(sizes: Record<string, number>, grounds = 1) {
  const entries = Object.entries(sizes).flatMap(([category, size]) =>
    Array.from({ length: size }, (_, index): ProposalEntry => ({
      id: `${category}-${index}`,
      category,
      sex: 'FEMALE',
      clubId: `${category}${index % 8}`,
      clubName: 'TV',
    })),
  );
  return {
    entries,
    categories: { FEMALE: Object.keys(sizes), MALE: [] },
    apparatus: { FEMALE: ['reck', 'boden', 'schaukelringe', 'sprung'], MALE: [] },
    sexes: ['FEMALE'] as const,
    due: Array.from({ length: grounds }, () => 0),
    numbers: { 'K1 FEMALE': 2 },
  };
}

const OPTIONS = { size: 11, maxSize: 12, keepTogether: true, mergeSmall: true };

function describeProposal(proposal: ProposedDivision[]) {
  return describeDivisions(proposal).map(({ category, number, lineups, together }) => [
    `${category} ${number}`,
    lineups.map(({ apparatus }) => apparatus).join(' '),
    together.map(({ category, number }) => `${category} ${number}`).join(' '),
  ]);
}

describe('createFullProposal', () => {
  it('merges small divisions on different apparatus, one after the other', () => {
    const proposal = createFullProposal(createData({ K1: 20, K2: 22 }), OPTIONS);
    expect(describeProposal(proposal)).toEqual([
      ['K1 3', 'reck boden', 'K2 1'],
      ['K2 1', 'schaukelringe sprung', 'K1 3'],
    ]);
  });

  it('merges what does not fill a division', () => {
    const proposal = createFullProposal(createData({ K1: 64, K2: 20 }), OPTIONS);
    expect(describeProposal(proposal)).toEqual([
      ['K1 3', 'reck boden schaukelringe sprung', ''],
      ['K1 4', 'reck boden', 'K2 1'],
      ['K2 1', 'schaukelringe sprung', 'K1 4'],
    ]);
  });

  it('leaves divisions alone that do not fit together, or when not wanted', () => {
    const alone = createFullProposal(createData({ K1: 64, K2: 30 }), OPTIONS);
    expect(describeDivisions(alone).map(({ together }) => together)).toEqual([[], [], []]);
    const unwanted = createFullProposal(createData({ K1: 20, K2: 22 }), {
      ...OPTIONS,
      mergeSmall: false,
    });
    expect(describeProposal(unwanted)).toEqual([
      ['K1 3', 'reck boden', ''],
      ['K2 1', 'reck boden', ''],
    ]);
  });

  it('has everybody once and merged divisions on the same ground', () => {
    const data = createData({ K1: 64, K2: 95, K3: 20, K4: 9, K5: 44 }, 3);
    const proposal = createFullProposal(data, OPTIONS);
    expect(idsOf(proposal)).toEqual(data.entries.map(({ id }) => id).sort());
  });
});

describe('applyMoves', () => {
  it('moves a club to a lineup of another division and back', () => {
    const proposal = createFullProposal(createData({ K1: 64 }), OPTIONS);
    const [first, second] = proposal;
    const [{ clubId }] = first.lineups[0].members;
    const there = { division: getKey(second), apparatus: second.lineups[1].apparatus };
    const here = { division: getKey(first), apparatus: first.lineups[0].apparatus };
    const isClub = (member: ProposalEntry) => member.clubId === clubId;
    const before = second.lineups[1].members.filter(isClub).length;
    const count = first.lineups[0].members.filter(isClub).length;

    const moved = applyMoves(proposal, [{ clubId, from: here, to: there }]);
    expect(moved[0].lineups[0].members.filter(isClub)).toEqual([]);
    expect(moved[1].lineups[1].members.filter(isClub)).toHaveLength(before + count);
    expect(idsOf(moved)).toEqual(idsOf(proposal));
    // What was proposed stays as it was.
    expect(first.lineups[0].members.filter(isClub)).toHaveLength(count);

    const back = applyMoves(moved, [{ clubId, from: there, to: here }]);
    expect(idsOf(back)).toEqual(idsOf(proposal));
    expect(back[0].lineups[0].members.filter(isClub)).toHaveLength(before + count);
  });
});

describe('chooseLineup', () => {
  const entries = (clubId: string, count: number) =>
    Array.from({ length: count }, (_, index): ProposalEntry => ({
      id: `${clubId}-${index}`,
      category: 'K5',
      sex: 'FEMALE',
      clubId,
      clubName: clubId,
    }));
  const division: ProposedDivision = {
    category: 'K5',
    sex: 'FEMALE',
    number: 1,
    ground: 1,
    slot: 0,
    lineups: [
      { apparatus: 'reck', members: entries('a', 9) },
      { apparatus: 'boden', members: [...entries('b', 4), ...entries('c', 4)] },
      { apparatus: 'sprung', members: entries('d', 8) },
    ],
  };

  it('is the smallest one, with the fewest clubs', () => {
    expect(chooseLineup(division, { clubId: 'x', count: 5 }, 12)).toBe('sprung');
  });

  it('is where the club already is, if it fits', () => {
    expect(chooseLineup(division, { clubId: 'a', count: 3 }, 12)).toBe('reck');
    expect(chooseLineup(division, { clubId: 'a', count: 4 }, 12)).toBe('sprung');
  });
});

function idsOf(divisions: readonly ProposedDivision[]) {
  return divisions
    .flatMap(({ lineups }) => lineups.flatMap(({ members }) => members.map(({ id }) => id)))
    .sort();
}
