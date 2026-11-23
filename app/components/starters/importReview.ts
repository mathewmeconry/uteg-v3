import { categoryForSex, type ImportedStarter } from '~/lib/domain/starterImport';
import { starterSchema } from '~/lib/domain/starter';
import type { ContestOptions } from '~/lib/contestOptions.server';

/** A row being reviewed. Numbers are kept as typed. */
export type ReviewRow = {
  key: number;
  stvId: string;
  firstname: string;
  lastname: string;
  birthYear: string;
  sex: 'FEMALE' | 'MALE' | '';
  category: string;
  divisionNumber: string;
};
export type ReviewField = Exclude<keyof ReviewRow, 'key'>;

export type ReviewAction =
  | { type: 'load'; starters: ImportedStarter[] }
  | { type: 'change'; key: number; field: ReviewField; value: string }
  | { type: 'swap'; key: number }
  | { type: 'swapAll' }
  | { type: 'remove'; key: number }
  | { type: 'keep'; keys: number[] };

export function reviewReducer(rows: ReviewRow[], action: ReviewAction): ReviewRow[] {
  const update = (key: number, change: (row: ReviewRow) => ReviewRow) =>
    rows.map((row) => (row.key === key ? change(row) : row));

  switch (action.type) {
    case 'load':
      return action.starters.map(toReviewRow);
    case 'change':
      return update(action.key, (row) => changeField(row, action.field, action.value));
    case 'swap':
      return update(action.key, swapNames);
    case 'swapAll':
      return rows.map(swapNames);
    case 'remove':
      return rows.filter(({ key }) => key !== action.key);
    case 'keep':
      return rows.filter(({ key }) => action.keys.includes(key));
  }
}

/** The fields that keep a row from being imported. */
export function invalidFields(row: ReviewRow, { categories }: ContestOptions): ReviewField[] {
  const result = starterSchema.safeParse(toPerson(row));
  const fields = result.success
    ? []
    : result.error.issues.map(({ path }) => path[0] as ReviewField);
  if (row.category && row.sex && !categories[row.sex].includes(row.category)) {
    fields.push('category');
  }
  return [...new Set(fields)];
}

/** Whether the division does not exist. It is ignored, the row is imported without it. */
export function isDivisionUnknown(row: ReviewRow, { divisions }: ContestOptions) {
  if (!row.divisionNumber.trim()) return false;
  return !divisions.some(
    ({ category, sex, number }) =>
      category === row.category && sex === row.sex && number === Number(row.divisionNumber),
  );
}

/** The row as the import action takes it. */
export function toImportRow(row: ReviewRow) {
  const number = Number(row.divisionNumber);
  return {
    ...toPerson(row),
    category: row.category || null,
    divisionNumber: Number.isInteger(number) && number > 0 && number < 10_000 ? number : null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toReviewRow(starter: ImportedStarter, key: number): ReviewRow {
  return {
    key,
    stvId: starter.stvId ?? '',
    firstname: starter.firstname,
    lastname: starter.lastname,
    birthYear: starter.birthYear?.toString() ?? '',
    sex: starter.sex ?? '',
    category: starter.category ?? '',
    divisionNumber: starter.divisionNumber?.toString() ?? '',
  };
}

function toPerson({ stvId, firstname, lastname, birthYear, sex }: ReviewRow) {
  return {
    stvId,
    firstname,
    lastname,
    birthYear: /^\d{4}$/.test(birthYear.trim()) ? Number(birthYear) : null,
    sex: sex || null,
  };
}

function changeField(row: ReviewRow, field: ReviewField, value: string): ReviewRow {
  const changed = { ...row, [field]: value };
  // The open category is another one for the other sex.
  if (field === 'sex' && changed.sex) {
    changed.category = categoryForSex(changed.category, changed.sex);
  }
  return changed;
}

function swapNames(row: ReviewRow): ReviewRow {
  return { ...row, firstname: row.lastname, lastname: row.firstname };
}
