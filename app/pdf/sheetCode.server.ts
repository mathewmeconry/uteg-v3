import { createHash } from 'node:crypto';

/**
 * What the QR code on a page of the judging sheets holds, so a scan finds the rows written on it.
 * The divisions give the list again, the offset its first row on the page, and the hash tells
 * whether these rows changed after printing.
 */
export function sheetCode({
  apparatus,
  round,
  divisionIds,
  offset,
  entryIds,
}: {
  apparatus: string;
  round: number;
  divisionIds: string[];
  offset: number;
  entryIds: string[];
}) {
  const hash = createHash('sha256').update(entryIds.join(',')).digest('hex').slice(0, 8);
  return ['UTEG1', apparatus, round, offset, hash, divisionIds.toSorted().join(',')].join('/');
}
