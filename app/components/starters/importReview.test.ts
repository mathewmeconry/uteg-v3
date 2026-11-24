import { describe, expect, it } from 'vitest';
import type { ContestOptions } from '~/lib/contestOptions.server';
import type { ImportedStarter } from '~/lib/domain/starterImport';
import {
  invalidFields,
  isDivisionUnknown,
  reviewReducer,
  toImportRow,
  type ReviewRow,
} from './importReview';

const OPTIONS: ContestOptions = {
  id: 'c',
  name: 'EGT',
  categories: { FEMALE: ['K5', 'KD'], MALE: ['K5', 'KH'] },
  apparatus: ['reck'],
  divisions: [
    {
      id: 'd',
      category: 'K5',
      sex: 'FEMALE',
      number: 1,
      state: 'PENDING',
      starterCount: 0,
      apparatus: [],
    },
  ],
};

const ANNA: ImportedStarter = {
  stvId: null,
  firstname: 'Anna',
  lastname: 'Muster',
  birthYear: 2010,
  sex: 'FEMALE',
  category: 'K5',
  divisionNumber: 1,
};

function load(...changes: Partial<ImportedStarter>[]) {
  const starters = changes.map((change) => ({ ...ANNA, ...change }));
  return reviewReducer([], { type: 'load', starters });
}

describe('reviewReducer', () => {
  it('swaps names of one row and of all rows', () => {
    const rows = load({}, { firstname: 'Lea', lastname: 'Frei' });
    const one = reviewReducer(rows, { type: 'swap', key: 1 });
    expect(one.map(({ firstname }) => firstname)).toEqual(['Anna', 'Frei']);
    const all = reviewReducer(rows, { type: 'swapAll' });
    expect(all.map(({ firstname }) => firstname)).toEqual(['Muster', 'Frei']);
  });

  it('changes, removes and keeps rows by key', () => {
    let rows = load({}, {}, {});
    rows = reviewReducer(rows, { type: 'remove', key: 0 });
    rows = reviewReducer(rows, { type: 'change', key: 2, field: 'firstname', value: 'Eva' });
    expect(rows.map(({ key, firstname }) => [key, firstname])).toEqual([
      [1, 'Anna'],
      [2, 'Eva'],
    ]);
    expect(reviewReducer(rows, { type: 'keep', keys: [2] })).toHaveLength(1);
  });

  it('switches the open category with the sex', () => {
    const [row] = reviewReducer(load({ category: 'KD' }), {
      type: 'change',
      key: 0,
      field: 'sex',
      value: 'MALE',
    });
    expect(row.category).toBe('KH');
  });
});

describe('invalidFields', () => {
  it.each<[Partial<ReviewRow>, string[]]>([
    [{}, []],
    [{ stvId: '' }, []],
    [{ category: '' }, []],
    [{ firstname: ' ' }, ['firstname']],
    [{ lastname: '' }, ['lastname']],
    [{ sex: '' }, ['sex']],
    [{ birthYear: '' }, ['birthYear']],
    [{ birthYear: '10' }, ['birthYear']],
    [{ birthYear: '1800' }, ['birthYear']],
    [{ category: 'KH' }, ['category']],
    [{ sex: '', category: 'KH' }, ['sex']],
    [{ category: 'foo' }, ['category']],
    [{ sex: '', category: 'foo' }, ['sex', 'category']],
  ])('%j: %j', (change, fields) => {
    expect(invalidFields({ ...load({})[0], ...change }, OPTIONS)).toEqual(fields);
  });
});

describe('isDivisionUnknown', () => {
  it.each<[Partial<ReviewRow>, boolean]>([
    [{}, false],
    [{ divisionNumber: '' }, false],
    [{ divisionNumber: '2' }, true],
    [{ divisionNumber: 'x' }, true],
    [{ sex: 'MALE' }, true],
    [{ category: '' }, true],
  ])('%j: %s', (change, expected) => {
    expect(isDivisionUnknown({ ...load({})[0], ...change }, OPTIONS)).toBe(expected);
  });
});

it('sends what the action accepts', () => {
  expect(toImportRow(load({})[0])).toEqual({
    stvId: '',
    firstname: 'Anna',
    lastname: 'Muster',
    birthYear: 2010,
    sex: 'FEMALE',
    category: 'K5',
    divisionNumber: 1,
  });
  expect(
    toImportRow({ ...load({ category: undefined })[0], divisionNumber: '99999' }),
  ).toMatchObject({ category: null, divisionNumber: null });
});
