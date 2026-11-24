import type { Sex } from '~/modules/types';

type RichCell = {
  result?: unknown;
  text?: unknown;
  richText?: { text: string }[];
  [key: string]: unknown;
};

/** A cell as read by exceljs: plain values, or objects for formulas, rich text and links. */
export type SheetCell = string | number | boolean | Date | null | undefined | RichCell;

export type ImportedStarter = {
  stvId: string | null;
  firstname: string;
  lastname: string;
  birthYear: number | null;
  /** Undefined when the sheet does not say. The user has to choose. */
  sex: Sex | undefined;
  category: string | undefined;
  divisionNumber: number | undefined;
};

type Field = keyof ImportedStarter;

const HEADERS: Record<Field, readonly string[]> = {
  stvId: ['stvid', 'stv', 'stvnr', 'stvnummer', 'stvnumber', 'idfsg', 'fsg', 'n°fsg', 'nofsg'],
  firstname: ['firstname', 'vorname', 'prénom'],
  lastname: ['lastname', 'nachname', 'name', 'nom'],
  birthYear: ['birthyear', 'yearofbirth', 'jahrgang', 'geburtsjahr', 'jg', 'annéedenaissance'],
  sex: ['geschlecht', 'biogeschlecht', 'biologischesgeschlecht', 'gender', 'sex', 'sexe'],
  category: ['category', 'kategorie', 'cat', 'kat', 'catégorie'],
  divisionNumber: ['division', 'abteilung', 'div', 'abt'],
};

// Without a sex column the sex is chosen in the review.
const REQUIRED_FIELDS: readonly Field[] = ['firstname', 'lastname', 'birthYear'];

const SEXES: Record<string, Sex> = {
  m: 'MALE',
  männlich: 'MALE',
  male: 'MALE',
  men: 'MALE',
  h: 'MALE',
  masculin: 'MALE',
  homme: 'MALE',
  f: 'FEMALE',
  w: 'FEMALE',
  weiblich: 'FEMALE',
  female: 'FEMALE',
  women: 'FEMALE',
  féminin: 'FEMALE',
  femme: 'FEMALE',
};

/** The starters of all starter sheets in a file. Other sheets are ignored. */
export function parseSheets(sheets: readonly SheetCell[][][]): ImportedStarter[] {
  return sheets.flatMap((rows) => parseSheet(rows) ?? []);
}

/**
 * The starters of a sheet, null when its header row is not one of a starter list. `onlySex` is the
 * sex of rows that do not give one.
 */
export function parseSheet(rows: readonly SheetCell[][], onlySex?: Sex): ImportedStarter[] | null {
  const [header, ...data] = rows
    .map((row) => Array.from(row, cellText))
    .filter((row) => row.some((text) => text !== ''));
  if (!header) return null;

  const columns = getColumns(header);
  if (REQUIRED_FIELDS.some((field) => columns[field] === undefined)) return null;

  return data.map((row) => {
    const get = (field: Field) => row[columns[field] ?? -1] ?? '';
    const sex = get('sex') === '' ? onlySex : SEXES[get('sex').toLowerCase()];
    return {
      stvId: get('stvId') || null,
      firstname: capitalize(get('firstname')),
      lastname: capitalize(get('lastname')),
      birthYear: parseBirthYear(get('birthYear')),
      sex,
      category: parseCategory(get('category'), sex),
      divisionNumber: parseDivisionNumber(get('divisionNumber')),
    };
  });
}

/** The open category is KD for women and KH for men. */
export function categoryForSex(category: string, sex: Sex) {
  if (category !== 'KD' && category !== 'KH') return category;
  return sex === 'FEMALE' ? 'KD' : 'KH';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  // The only date we expect is a birth date in the birth year column.
  if (cell instanceof Date) return String(cell.getUTCFullYear());
  if (typeof cell === 'object') {
    const { richText, result, text } = cell as RichCell;
    if (richText)
      return richText
        .map((part) => part.text)
        .join('')
        .trim();
    return cellText(result ?? text);
  }
  return String(cell).trim();
}

function getColumns(header: readonly string[]) {
  const columns: Partial<Record<Field, number>> = {};
  for (const [index, text] of header.entries()) {
    const key = text.toLowerCase().replace(/[-.\s]/g, '');
    const field = (Object.keys(HEADERS) as Field[]).find((name) => HEADERS[name].includes(key));
    if (field) columns[field] ??= index;
  }
  return columns;
}

function capitalize(name: string) {
  return name
    .toLowerCase()
    .replace(/(^|[\s-])(\S)/g, (_, separator, letter) => separator + letter.toUpperCase());
}

/** A year, or the year of a birth date: "2010", "10", "15.03.2010", "15.03.10", "2010-03-15". */
function parseBirthYear(text: string) {
  const full = /(?<!\d)\d{4}(?!\d)/.exec(text);
  if (full) return Number(full[0]);
  // Excel drops the leading zero of "05".
  const short = /^(?:\d{1,2}[./-]\d{1,2}[./-])?(\d{1,2})$/.exec(text);
  if (!short) return null;
  const year = Number(short[1]);
  return year > 50 ? 1900 + year : 2000 + year;
}

function parseCategory(text: string, sex: Sex | undefined) {
  const key = text
    .toLowerCase()
    .replace(/[-.\s]/g, '')
    // C5 is the French name of K5.
    .replace(/^[kc]/, '');
  if (/^[1-7]$/.test(key)) return `K${key}`;
  if (['d', 'damen', 'women', 'dames'].includes(key)) return categoryForSex('KD', sex ?? 'FEMALE');
  if (['h', 'herren', 'men', 'hommes'].includes(key)) return categoryForSex('KH', sex ?? 'MALE');
  // v2 called the open category 8.
  if (key === '8' && sex) return categoryForSex('KD', sex);
  // Not dropped, so the user sees what to correct.
  return text || undefined;
}

function parseDivisionNumber(text: string) {
  return Number(/\d+/.exec(text)?.[0]) || undefined;
}
