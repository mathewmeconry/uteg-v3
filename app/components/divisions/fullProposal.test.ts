import { createFullProposal } from './fullProposal';
import type { ProposalEntry } from './proposal';

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

function describeDivisions(proposal: ReturnType<typeof createFullProposal>) {
  return proposal.map(({ group, number, lineups, together }) => [
    `${group.category} ${number}`,
    lineups.map(({ apparatus }) => apparatus).join(' '),
    together.map(({ category, number }) => `${category} ${number}`).join(' '),
  ]);
}

describe('createFullProposal', () => {
  it('merges small divisions on different apparatus, one after the other', () => {
    const proposal = createFullProposal(createData({ K1: 20, K2: 22 }), OPTIONS);
    expect(describeDivisions(proposal)).toEqual([
      ['K1 3', 'reck boden', 'K2 1'],
      ['K2 1', 'schaukelringe sprung', 'K1 3'],
    ]);
  });

  it('merges what does not fill a division', () => {
    const proposal = createFullProposal(createData({ K1: 64, K2: 20 }), OPTIONS);
    expect(describeDivisions(proposal)).toEqual([
      ['K1 3', 'reck boden schaukelringe sprung', ''],
      ['K1 4', 'reck boden', 'K2 1'],
      ['K2 1', 'schaukelringe sprung', 'K1 4'],
    ]);
  });

  it('leaves divisions alone that do not fit together, or when not wanted', () => {
    const alone = createFullProposal(createData({ K1: 64, K2: 30 }), OPTIONS);
    expect(alone.map(({ together }) => together)).toEqual([[], [], []]);
    const unwanted = createFullProposal(createData({ K1: 20, K2: 22 }), {
      ...OPTIONS,
      mergeSmall: false,
    });
    expect(describeDivisions(unwanted)).toEqual([
      ['K1 3', 'reck boden', ''],
      ['K2 1', 'reck boden', ''],
    ]);
  });

  it('has everybody once and merged divisions on the same ground', () => {
    const data = createData({ K1: 64, K2: 95, K3: 20, K4: 9, K5: 44 }, 3);
    const proposal = createFullProposal(data, OPTIONS);
    const ids = proposal.flatMap(({ group }) =>
      group.divisions.flatMap((lineups) => Object.values(lineups).flat()),
    );
    expect(ids.sort()).toEqual(data.entries.map(({ id }) => id).sort());
    for (const { group, together } of proposal) {
      for (const other of together) {
        const found = proposal.find(
          (item) => item.group.category === other.category && item.number === other.number,
        );
        expect(found?.group.ground).toBe(group.ground);
      }
    }
  });
});
