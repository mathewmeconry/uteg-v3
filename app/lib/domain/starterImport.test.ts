import { categoryForSex, parseSheet, parseSheets, type SheetCell } from './starterImport';

const HEADER = ['STV-Nr.', 'Vorname', 'Nachname', 'Jahrgang', 'Geschlecht', 'Kat.', 'Abt.'];

function parseRow(...row: SheetCell[]) {
  return parseSheet([HEADER, row])?.[0];
}

describe('parseSheet', () => {
  it('reads a row', () => {
    expect(parseRow('1234', 'Anna', 'Muster', 2010, 'w', 'K5', 2)).toEqual({
      stvId: '1234',
      firstname: 'Anna',
      lastname: 'Muster',
      birthYear: 2010,
      sex: 'FEMALE',
      category: 'K5',
      divisionNumber: 2,
    });
  });

  it('finds English headers in any order and writing', () => {
    const sheet = [
      [' Birth Year ', 'SEX', 'last-name', 'First - Name', 'stv - id', 'category', 'Div.'],
      ['2011', 'female', 'Muster', 'Anna', 55, '3', '1'],
    ];
    expect(parseSheet(sheet)?.[0]).toEqual({
      stvId: '55',
      firstname: 'Anna',
      lastname: 'Muster',
      birthYear: 2011,
      sex: 'FEMALE',
      category: 'K3',
      divisionNumber: 1,
    });
  });

  it('accepts a header without STV-ID, category and division', () => {
    const rows = parseSheet([
      ['Name', 'Vorname', 'JG', 'Bio. Geschlecht'],
      ['Muster', 'Max', 10, 'm'],
    ]);
    expect(rows?.[0]).toEqual({
      stvId: null,
      firstname: 'Max',
      lastname: 'Muster',
      birthYear: 2010,
      sex: 'MALE',
      category: undefined,
      divisionNumber: undefined,
    });
  });

  it('detects the sheet by its header even when the first row is incomplete', () => {
    const rows = parseSheet([HEADER, [null, 'Anna'], [null, 'Max', 'Muster', 2010, 'm']]);
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toMatchObject({ firstname: 'Anna', lastname: '', birthYear: null });
  });

  it('is null for a sheet without starter headers', () => {
    expect(parseSheet([['Bemerkungen'], ['foo']])).toBeNull();
    expect(parseSheet([])).toBeNull();
  });

  it('skips empty rows, also before the header', () => {
    expect(parseSheet([[], [null], HEADER, [], ['', ' '], [1, 'A', 'B', 2010, 'm']])).toHaveLength(
      1,
    );
  });

  it('capitalises names', () => {
    expect(parseRow('', 'ANNA-LENA maria', 'von MUSTER', 2010, 'w')).toMatchObject({
      firstname: 'Anna-Lena Maria',
      lastname: 'Von Muster',
    });
  });

  it.each([
    ['99', 1999],
    [51, 1951],
    ['50', 2050],
    ['05', 2005],
    [5, 2005],
    [new Date('2009-05-05T00:00:00Z'), 2009],
    ['x', null],
    ['15.03.2010', 2010],
    ['1.1.2012', 2012],
    ['15.03.10', 2010],
    ['2010-03-15T00:00:00.000Z', 2010],
    ['Jg. 2010', 2010],
    [40252, null],
    ['123', null],
    [{ formula: 'A1', result: new Date('2009-05-05T00:00:00Z') }, 2009],
  ])('reads the birth year %s', (input, birthYear) => {
    expect(parseRow('', 'A', 'B', input, 'm')?.birthYear).toBe(birthYear);
  });

  it.each([
    ['m', 'MALE'],
    ['Männlich', 'MALE'],
    ['male', 'MALE'],
    ['men', 'MALE'],
    [' W ', 'FEMALE'],
    ['f', 'FEMALE'],
    ['weiblich', 'FEMALE'],
    ['women', 'FEMALE'],
    ['?', undefined],
    ['', undefined],
  ])('reads the sex "%s"', (input, sex) => {
    expect(parseRow('', 'A', 'B', 2010, input)?.sex).toBe(sex);
  });

  it.each([
    ['K1', 'w', 'K1'],
    ['k 7', 'w', 'K7'],
    [4, 'm', 'K4'],
    ['KD', 'w', 'KD'],
    ['women', 'w', 'KD'],
    ['Damen', 'w', 'KD'],
    ['KH', 'm', 'KH'],
    ['Herren', 'm', 'KH'],
    ['men', 'm', 'KH'],
    ['8', 'm', 'KH'],
    ['K8', 'w', 'KD'],
    ['KD', 'm', 'KH'],
    ['KH', '', 'KH'],
    ['K8', '', undefined],
    ['K9', 'w', undefined],
    ['foo', 'w', undefined],
    ['', 'w', undefined],
  ])('reads the category "%s" for "%s"', (input, sex, category) => {
    expect(parseRow('', 'A', 'B', 2010, sex, input)?.category).toBe(category);
  });

  it.each([
    ['3', 3],
    ['Abt. 2', 2],
    ['0', undefined],
    ['x', undefined],
  ])('reads the division "%s"', (input, divisionNumber) => {
    expect(parseRow('', 'A', 'B', 2010, 'w', 'K1', input)?.divisionNumber).toBe(divisionNumber);
  });

  it('reads formula, rich text and link cells', () => {
    expect(
      parseRow(
        { text: '77', hyperlink: 'x' },
        { richText: [{ text: 'An' }, { text: 'na' }] },
        { formula: 'A1', result: 'Muster' },
        { formula: 'A2', result: 2010 },
        'w',
      ),
    ).toMatchObject({ stvId: '77', firstname: 'Anna', lastname: 'Muster', birthYear: 2010 });
  });
});

describe('parseSheets', () => {
  it('collects every starter sheet of a file', () => {
    const rows = parseSheets([
      [HEADER, [1, 'A', 'A', 2010, 'm']],
      [['Notizen'], ['x']],
      [HEADER, [2, 'B', 'B', 2010, 'm']],
    ]);
    expect(rows.map(({ stvId }) => stvId)).toEqual(['1', '2']);
  });
});

describe('categoryForSex', () => {
  it('switches the open category when the sex changes', () => {
    expect(categoryForSex('KD', 'MALE')).toBe('KH');
    expect(categoryForSex('KH', 'FEMALE')).toBe('KD');
    expect(categoryForSex('K5', 'MALE')).toBe('K5');
  });
});
