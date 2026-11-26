import { createHash } from 'node:crypto';

type SheetPage = { apparatus: string; round: number; divisionIds: string[]; offset: number };

/**
 * What the QR code on a page of the judging sheets holds, so a scan finds the rows written on it.
 * The divisions give the list again, the offset its first row on the page, and the hash tells
 * whether these rows changed after printing. Upper case with `/` and `.` only, the characters QR
 * codes store densest, as ULIDs already are: with many divisions the code stays readable.
 */
export function sheetCode({
  apparatus,
  round,
  divisionIds,
  offset,
  entryIds,
}: SheetPage & { entryIds: string[] }) {
  return ['UTEG1', apparatus, round, offset, rowsHash(entryIds), divisionIds.toSorted().join('.')]
    .join('/')
    .toUpperCase();
}

/** The page of a sheet code, or null when it is none. */
export function parseSheetCode(code: string): (SheetPage & { hash: string }) | null {
  const match = /^UTEG1\/([A-Z]+)\/(\d+)\/(\d+)\/([0-9A-F]{8})\/([0-9A-Z]+(?:\.[0-9A-Z]+)*)$/.exec(
    code,
  );
  if (!match) return null;
  const [, apparatus, round, offset, hash, divisionIds] = match;
  return {
    apparatus: apparatus.toLowerCase(),
    round: Number(round),
    offset: Number(offset),
    hash,
    divisionIds: divisionIds.split('.'),
  };
}

export function rowsHash(entryIds: string[]) {
  return createHash('sha256').update(entryIds.join(',')).digest('hex').slice(0, 8).toUpperCase();
}
