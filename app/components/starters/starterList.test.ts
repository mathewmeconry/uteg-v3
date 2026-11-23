import { describe, expect, it } from 'vitest';
import {
  filterStarters,
  filterValues,
  NO_FILTERS,
  sortStarters,
  type Filters,
} from './starterList';
import type { StarterRow } from './starterRow';

const APPARATUS = ['reck', 'boden', 'schaukelringe'];

function row(data: Partial<StarterRow>): StarterRow {
  return {
    id: data.firstname ?? 'x',
    firstname: 'Anna',
    lastname: 'Muster',
    birthYear: 2010,
    sex: 'FEMALE',
    club: { id: 'chur', name: 'TV Chur', location: 'Chur' },
    stvId: null,
    athleteId: 'a',
    athlete: { firstname: 'Anna', lastname: 'Muster', birthYear: 2010, sex: 'FEMALE' },
    differs: false,
    entryId: 'e',
    category: 'K5',
    divisionId: null,
    divisionNumber: null,
    lineupId: null,
    startApparatus: null,
    ...data,
  };
}

const ROWS = [
  row({ firstname: 'Anna', stvId: '4711' }),
  row({ firstname: 'Zoé', category: 'K10', divisionNumber: 10, startApparatus: 'reck' }),
  row({
    firstname: 'Jan',
    sex: 'MALE',
    category: 'K2',
    divisionNumber: 2,
    startApparatus: 'boden',
  }),
  row({
    firstname: 'Ötzi',
    category: null,
    club: { id: 'buchs', name: 'Geräteriege', location: 'Buchs' },
  }),
];

const names = (rows: StarterRow[]) => rows.map(({ firstname }) => firstname);

describe('filterStarters', () => {
  const search = (text: string) =>
    names(filterStarters(ROWS, { search: text, filters: NO_FILTERS }));
  const filter = (filters: Partial<Filters>) =>
    names(filterStarters(ROWS, { search: '', filters: { ...NO_FILTERS, ...filters } }));

  it('searches names, club, location and STV-ID, ignoring accents and order', () => {
    expect(search('')).toHaveLength(4);
    expect(search('zoe')).toEqual(['Zoé']);
    expect(search('muster ann')).toEqual(['Anna']);
    expect(search('geraete')).toEqual([]);
    expect(search('gerate')).toEqual(['Ötzi']);
    expect(search('buchs ötzi')).toEqual(['Ötzi']);
    expect(search('471')).toEqual(['Anna']);
    expect(search('anna buchs')).toEqual([]);
  });

  it('combines filters, with several values each', () => {
    expect(filter({ category: ['K2', 'K10'] })).toEqual(['Zoé', 'Jan']);
    expect(filter({ category: ['K2', 'K10'], sex: ['MALE'] })).toEqual(['Jan']);
    expect(filter({ club: ['buchs'] })).toEqual(['Ötzi']);
  });

  it('finds starters without a value', () => {
    expect(filter({ category: [''] })).toEqual(['Ötzi']);
    expect(filter({ division: ['', '2'] })).toEqual(['Anna', 'Jan', 'Ötzi']);
  });
});

describe('sortStarters', () => {
  it('sorts numbers by value, missing values last in both directions', () => {
    const sort = (direction: 'asc' | 'desc') =>
      names(sortStarters(ROWS, { column: 'category', direction }, APPARATUS));
    expect(sort('asc')).toEqual(['Jan', 'Anna', 'Zoé', 'Ötzi']);
    expect(sort('desc')).toEqual(['Zoé', 'Anna', 'Jan', 'Ötzi']);
  });

  it('sorts apparatus in rotation order and equal rows by name', () => {
    const sorted = sortStarters(ROWS, { column: 'startApparatus', direction: 'asc' }, APPARATUS);
    expect(names(sorted)).toEqual(['Zoé', 'Jan', 'Anna', 'Ötzi']);
  });

  it('sorts umlauts like their base letter', () => {
    const sorted = sortStarters(ROWS, { column: 'firstname', direction: 'asc' }, APPARATUS);
    expect(names(sorted)).toEqual(['Anna', 'Jan', 'Ötzi', 'Zoé']);
  });
});

it('offers the values that occur', () => {
  expect(filterValues(ROWS, 'category', APPARATUS)).toEqual(['K2', 'K5', 'K10', '']);
  expect(filterValues(ROWS, 'club', APPARATUS)).toEqual(['buchs', 'chur']);
  expect(filterValues(ROWS, 'startApparatus', APPARATUS)).toEqual(['reck', 'boden', '']);
});
