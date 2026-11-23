import type { StarterRow } from './starterRow';

export const COLUMNS = [
  'lastname',
  'firstname',
  'sex',
  'birthYear',
  'club',
  'location',
  'category',
  'division',
  'startApparatus',
] as const;
export type Column = (typeof COLUMNS)[number];

export const FILTERS = ['sex', 'club', 'category', 'division', 'startApparatus'] as const;
export type Filter = (typeof FILTERS)[number];

/** Chosen values by filter. The empty string stands for starters without a value. */
export type Filters = Record<Filter, string[]>;
export type Sort = { column: Column; direction: 'asc' | 'desc' };

export const NO_FILTERS: Filters = {
  sex: [],
  club: [],
  category: [],
  division: [],
  startApparatus: [],
};

const collator = new Intl.Collator('de-CH', { numeric: true });

export function filterStarters(
  rows: readonly StarterRow[],
  { search, filters }: { search: string; filters: Filters },
) {
  const words = normalize(search).split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (FILTERS.some((key) => filters[key].length > 0 && !filters[key].includes(value(row, key)))) {
      return false;
    }
    if (words.length === 0) return true;
    const { firstname, lastname, club, stvId } = row;
    const text = normalize([firstname, lastname, club.name, club.location, stvId].join(' '));
    return words.every((word) => text.includes(word));
  });
}

/** Missing values always come last, equal ones are ordered by name. */
export function sortStarters(
  rows: readonly StarterRow[],
  { column, direction }: Sort,
  apparatus: readonly string[],
) {
  const sign = direction === 'asc' ? 1 : -1;
  const key = (row: StarterRow) => {
    if (column !== 'startApparatus') return columnText(row, column);
    return row.startApparatus ? String(apparatus.indexOf(row.startApparatus)) : '';
  };
  const byName = (a: StarterRow, b: StarterRow) =>
    collator.compare(a.lastname, b.lastname) || collator.compare(a.firstname, b.firstname);

  return rows.toSorted((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left && right) return sign * collator.compare(left, right) || byName(a, b);
    return Number(!left) - Number(!right) || byName(a, b);
  });
}

/** The values that occur in a column, in the order they are offered. */
export function filterValues(
  rows: readonly StarterRow[],
  key: Filter,
  apparatus: readonly string[],
) {
  const sorted = sortStarters(rows, { column: key, direction: 'asc' }, apparatus);
  return [...new Set(sorted.map((row) => value(row, key)))];
}

/** The untranslated text of a column. */
export function columnText(row: StarterRow, column: Column): string {
  switch (column) {
    case 'club':
      return row.club.name;
    case 'location':
      return row.club.location;
    case 'division':
      return row.divisionNumber?.toString() ?? '';
    default:
      return row[column]?.toString() ?? '';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function value(row: StarterRow, key: Filter) {
  // Clubs of different places can have the same name.
  return key === 'club' ? row.club.id : columnText(row, key);
}

/** "Zoe" also finds "Zoé". */
function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
