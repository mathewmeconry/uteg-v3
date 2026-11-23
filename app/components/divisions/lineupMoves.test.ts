import { applyMove, findColumn, stepMove, UNASSIGNED } from './lineupMoves';

const columns = [
  { id: UNASSIGNED, entryIds: ['x', 'y'] },
  { id: 'reck', entryIds: ['a', 'b', 'c'] },
];

const text = (move: Parameters<typeof applyMove>[1]) =>
  applyMove(columns, move)
    .map(({ entryIds }) => entryIds.join(''))
    .join('|');

describe('applyMove', () => {
  it.each([
    [{ entryIds: ['x'], columnId: 'reck' }, 'y|abcx'],
    [{ entryIds: ['x', 'y'], columnId: 'reck', beforeId: 'b' }, '|axybc'],
    [{ entryIds: ['c'], columnId: 'reck', beforeId: 'a' }, 'xy|cab'],
    [{ entryIds: ['a'], columnId: 'reck' }, 'xy|bca'],
    [{ entryIds: ['b'], columnId: UNASSIGNED }, 'xyb|ac'],
    [{ entryIds: ['x'], columnId: 'reck', beforeId: 'gone' }, 'y|abcx'],
  ])('%j', (move, expected) => {
    expect(text(move)).toBe(expected);
  });
});

describe('findColumn', () => {
  it('finds the column of an entry', () => {
    expect(findColumn(columns, 'b')?.id).toBe('reck');
    expect(findColumn(columns, 'nope')).toBeUndefined();
  });
});

describe('stepMove', () => {
  it.each([
    ['a', 'down', 'xy|bac'],
    ['b', 'down', 'xy|acb'],
    ['b', 'up', 'xy|bac'],
    ['c', 'up', 'xy|acb'],
  ] as const)('%s %s', (id, step, expected) => {
    expect(text(stepMove('reck', ['a', 'b', 'c'], id, step)!)).toBe(expected);
  });

  it('stays within the list', () => {
    expect(stepMove('reck', ['a', 'b'], 'a', 'up')).toBeNull();
    expect(stepMove('reck', ['a', 'b'], 'b', 'down')).toBeNull();
  });

  it('passes the next entry the filter shows', () => {
    expect(text(stepMove('reck', ['a', 'c'], 'a', 'down')!)).toBe('xy|bca');
    expect(text(stepMove('reck', ['a', 'c'], 'c', 'up')!)).toBe('xy|cab');
  });
});
