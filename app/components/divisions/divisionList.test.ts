import {
  applyMove,
  filterDivisions,
  getStartWarnings,
  inRunningOrder,
  matchesSearch,
  stepMove,
  type Division,
} from './divisionList';

function division(id: string, data: Partial<Division> = {}) {
  return {
    id,
    category: 'K5',
    sex: 'FEMALE',
    ground: 1,
    position: 1,
    createdAt: new Date(5),
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

describe('inRunningOrder', () => {
  it('has what ended by its end, what runs, and what is planned by position', () => {
    const list = [
      division('a', { position: 4 }),
      division('b', { position: 3 }),
      division('c', { position: 5, state: 'RUNNING' }),
      division('d', { position: 1, state: 'ENDED', endedAt: new Date(2000) }),
      division('e', { position: 2, state: 'ENDED', endedAt: new Date(1000) }),
      division('f', { position: 4, createdAt: new Date(1) }),
    ];
    expect(ids(inRunningOrder(list))).toBe('edcbfa');
  });
});

describe('moving', () => {
  const list = [
    division('a', { position: 1 }),
    division('b', { position: 2 }),
    division('c', { position: 3 }),
    division('x', { position: 1, ground: 2 }),
  ];
  const onGround = (moved: Division[], ground: number) =>
    ids(inRunningOrder(moved).filter((item) => item.ground === ground));

  it.each([
    [{ id: 'c', ground: 1, beforeId: 'a' }, 'cab', 'x'],
    [{ id: 'a', ground: 1 }, 'bca', 'x'],
    [{ id: 'a', ground: 1, beforeId: 'c' }, 'bac', 'x'],
    [{ id: 'a', ground: 2, beforeId: 'x' }, 'bc', 'ax'],
    [{ id: 'a', ground: 2, beforeId: 'gone' }, 'bc', 'xa'],
  ])('shows %j', (move, first, second) => {
    const moved = applyMove(list, move);
    expect([onGround(moved, 1), onGround(moved, 2)]).toEqual([first, second]);
  });

  it('steps up and down', () => {
    const planned = list.slice(0, 3);
    const step = (id: string, by: -1 | 1) => {
      const move = stepMove(planned, id, by);
      return move && onGround(applyMove(list, move), 1);
    };
    expect(step('b', -1)).toBe('bac');
    expect(step('a', 1)).toBe('bac');
    expect(step('b', 1)).toBe('acb');
    expect(step('a', -1)).toBeNull();
    expect(step('c', 1)).toBeNull();
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
