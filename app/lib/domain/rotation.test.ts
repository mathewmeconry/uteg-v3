import {
  compareDivisions,
  getRoundList,
  getRoundSchedule,
  isVisible,
  rollList,
  startApparatus,
  type RotationDivision,
} from './rotation';

const MEN = ['reck', 'boden', 'schaukelringe', 'sprung', 'barren'];
const WOMEN = MEN.slice(0, 4);

type Entry = { id: string; withdrawnAt: Date | null };

function entry(id: string, withdrawnAt: Date | null = null): Entry {
  return { id, withdrawnAt };
}

function division(data: Partial<RotationDivision<Entry>> = {}): RotationDivision<Entry> {
  return {
    id: 'd1',
    category: 'K5',
    number: 1,
    state: 'RUNNING',
    startedAt: new Date('2026-01-01T10:00:00Z'),
    apparatus: WOMEN,
    lineups: {},
    ...data,
  };
}

const ids = (list: Entry[]) => list.map(({ id }) => id);

describe('startApparatus', () => {
  it('is the apparatus itself in the first round', () => {
    expect(startApparatus(WOMEN, 'boden', 0)).toBe('boden');
  });

  it('moves every lineup one apparatus further per round', () => {
    expect(startApparatus(WOMEN, 'boden', 1)).toBe('reck');
    expect(startApparatus(WOMEN, 'reck', 1)).toBe('sprung');
    expect(startApparatus(MEN, 'reck', 1)).toBe('barren');
    expect(startApparatus(MEN, 'reck', 4)).toBe('boden');
  });

  it('visits every apparatus exactly once', () => {
    for (const start of MEN) {
      const visited = MEN.flatMap((apparatus) =>
        MEN.filter((_, round) => startApparatus(MEN, apparatus, round) === start).map(
          () => apparatus,
        ),
      );
      expect(visited).toEqual(MEN);
    }
  });

  it('is null for an apparatus the division does not have', () => {
    expect(startApparatus(WOMEN, 'barren', 0)).toBeNull();
  });

  it('is null outside the rounds', () => {
    expect(startApparatus(WOMEN, 'reck', 4)).toBeNull();
    expect(startApparatus(WOMEN, 'reck', -1)).toBeNull();
  });
});

describe('rollList', () => {
  it.each([
    ['abc', 0, 'abc'],
    ['abc', 1, 'bca'],
    ['abc', 2, 'cab'],
    ['abc', 3, 'abc'],
    ['ab', 3, 'ba'],
    ['abc', 4, 'bca'],
    ['a', 4, 'a'],
    ['', 2, ''],
  ])('rolls %s by %i to %s', (list, round, expected) => {
    expect(rollList([...list], round).join('')).toBe(expected);
  });

  it('keeps the input', () => {
    const list = ['a', 'b'];
    rollList(list, 1);
    expect(list).toEqual(['a', 'b']);
  });
});

describe('isVisible', () => {
  const startedAt = new Date('2026-01-01T10:00:00Z');
  const before = new Date('2026-01-01T09:00:00Z');
  const after = new Date('2026-01-01T11:00:00Z');

  it('shows active entries', () => {
    expect(isVisible(entry('a'), division({ state: 'PENDING', startedAt: null }))).toBe(true);
  });

  it('keeps the slot of an entry withdrawn after the start', () => {
    expect(isVisible(entry('a', after), division({ startedAt }))).toBe(true);
    expect(isVisible(entry('a', after), division({ state: 'ENDED', startedAt }))).toBe(true);
  });

  it('hides an entry withdrawn before the start', () => {
    expect(isVisible(entry('a', before), division({ startedAt }))).toBe(false);
  });

  it('hides withdrawn entries while the division is not started', () => {
    expect(isVisible(entry('a', after), division({ state: 'PENDING', startedAt }))).toBe(false);
  });
});

describe('getRoundList', () => {
  it('merges divisions by category, then number', () => {
    const divisions = [
      division({ id: '3', category: 'K6', number: 1, lineups: { reck: [entry('k6-1')] } }),
      division({ id: '2', category: 'K5', number: 10, lineups: { reck: [entry('k5-10')] } }),
      division({ id: '1', category: 'K5', number: 2, lineups: { reck: [entry('k5-2')] } }),
    ];
    expect(ids(getRoundList(divisions, 'reck', 0))).toEqual(['k5-2', 'k5-10', 'k6-1']);
    expect(divisions.toSorted(compareDivisions).map(({ id }) => id)).toEqual(['1', '2', '3']);
  });

  it('takes the rotated lineup and rolls the merged list', () => {
    const divisions = [
      division({ id: '1', number: 1, lineups: { reck: [entry('a'), entry('b')] } }),
      division({ id: '2', number: 2, lineups: { reck: [entry('c')] } }),
    ];
    expect(ids(getRoundList(divisions, 'boden', 1))).toEqual(['b', 'c', 'a']);
    expect(ids(getRoundList(divisions, 'reck', 1))).toEqual([]);
  });

  it('counts the slot of a withdrawn entry when rolling', () => {
    const withdrawn = entry('b', new Date('2026-01-01T11:00:00Z'));
    const divisions = [division({ lineups: { reck: [entry('a'), withdrawn, entry('c')] } })];
    expect(ids(getRoundList(divisions, 'boden', 1))).toEqual(['b', 'c', 'a']);
  });

  it('keeps women off the Barren on a mixed ground', () => {
    const divisions = [
      division({ id: 'w', apparatus: WOMEN, lineups: { sprung: [entry('w')] } }),
      division({
        id: 'm',
        number: 2,
        apparatus: MEN,
        lineups: { sprung: [entry('m')], reck: [entry('m-reck')] },
      }),
    ];
    // Women go from Sprung to Reck, men to Barren.
    expect(ids(getRoundList(divisions, 'barren', 1))).toEqual(['m']);
    expect(ids(getRoundList(divisions, 'reck', 1))).toEqual(['w']);
    expect(ids(getRoundList(divisions, 'reck', 4))).toEqual([]);
    expect(ids(getRoundList(divisions, 'barren', 4))).toEqual(['m-reck']);
  });
});

describe('getRoundSchedule', () => {
  it('has the rounds of the longest division that uses the apparatus', () => {
    const divisions = [
      division({ id: 'w', apparatus: WOMEN, lineups: { reck: [entry('w')] } }),
      division({ id: 'm', number: 2, apparatus: MEN, lineups: { reck: [entry('m')] } }),
    ];
    expect(getRoundSchedule(divisions, 'reck').map(ids)).toEqual([['w', 'm'], [], [], [], []]);
    expect(getRoundSchedule(divisions.slice(0, 1), 'reck')).toHaveLength(4);
    expect(getRoundSchedule(divisions.slice(0, 1), 'barren')).toEqual([]);
  });
});
