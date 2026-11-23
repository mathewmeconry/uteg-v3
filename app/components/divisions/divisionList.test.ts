import {
  filterDivisions,
  getStartWarnings,
  matchesSearch,
  sortDivisions,
  type Division,
} from './divisionList';

function division(id: string, data: Partial<Division> = {}) {
  return {
    id,
    category: 'K5',
    sex: 'FEMALE',
    ground: 1,
    state: 'PENDING',
    starterCount: 0,
    unassignedCount: 0,
    progress: { reck: 0, boden: 0 },
    ...data,
  } as Division;
}

const ids = (list: Division[]) => list.map(({ id }) => id).join('');

describe('filterDivisions', () => {
  const list = [
    division('a'),
    division('b', { category: 'K6', sex: 'MALE' }),
    division('c', { ground: 2, state: 'RUNNING' }),
  ];

  it.each([
    ['', 'abc'],
    ['category=K5', 'ac'],
    ['sex=MALE', 'b'],
    ['ground=2', 'c'],
    ['state=PENDING&category=K5', 'a'],
    ['category=K7', ''],
    ['category=', 'abc'],
  ])('%s', (query, expected) => {
    expect(ids(filterDivisions(list, new URLSearchParams(query)))).toBe(expected);
  });
});

describe('matchesSearch', () => {
  it.each([
    ['', true],
    ['k5 weib', true],
    ['1 K5', true],
    ['  ', true],
    ['k6', false],
    ['k5 männlich', false],
  ])('%s', (search, expected) => {
    expect(matchesSearch('K5 Weiblich, Abteilung 1', search)).toBe(expected);
  });
});

describe('sortDivisions', () => {
  const list = [
    division('a', { number: 2, sex: 'MALE', ground: 2, state: 'ENDED', starterCount: 3 }),
    division('b', { number: 3, ground: 1, state: 'PENDING', starterCount: 9 }),
    division('c', { number: 1, ground: 2, state: 'RUNNING', starterCount: 3 }),
  ];

  it.each([
    [null, 'abc'],
    ['category', 'abc'],
    ['number', 'cab'],
    ['sex', 'bca'],
    ['ground', 'bac'],
    ['state', 'cba'],
    ['starters', 'bac'],
  ])('%s', (key, expected) => {
    expect(ids(sortDivisions(list, key))).toBe(expected);
  });
});

describe('getStartWarnings', () => {
  it('has none for new, complete divisions on a ground that is not competing', () => {
    const running = [
      division('r', { state: 'RUNNING' }),
      division('s', { state: 'RUNNING', ground: 2, progress: { reck: 1 } }),
    ];
    expect(getStartWarnings([division('a')], running)).toEqual({
      ended: [],
      progress: [],
      unassigned: [],
      behind: [],
    });
  });

  it('finds ended, stopped and incomplete divisions', () => {
    const ended = division('e', { state: 'ENDED', progress: { reck: 2, boden: 2 } });
    const stopped = division('s', { progress: { reck: 1, boden: 0 } });
    const incomplete = division('u', { unassignedCount: 2 });
    const warnings = getStartWarnings([ended, stopped, incomplete], []);
    expect(ids(warnings.ended)).toBe('e');
    expect(ids(warnings.progress)).toBe('s');
    expect(ids(warnings.unassigned)).toBe('u');
  });

  it('finds running divisions the new ones are behind, as soon as one apparatus is ahead', () => {
    const ahead = division('r', { state: 'RUNNING', progress: { reck: 1, boden: 0 } });
    expect(ids(getStartWarnings([division('a')], [ahead]).behind)).toBe('r');
    expect(ids(getStartWarnings([division('a', { ground: 2 })], [ahead]).behind)).toBe('');
  });
});
