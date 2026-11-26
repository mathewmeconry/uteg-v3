import { isSameGrade } from './domain/gradeInput';
import { DomainError } from './errors';
import { publish } from './events.server';
import { computeGrade, getGradingState } from './judging.server';
import { SHEET } from './judgingSheet';
import { prisma } from './prisma.server';
import { parseSheetCode, rowsHash } from './sheetCode.server';

/** The largest image of a row's handwriting. The scan page sends far smaller ones. */
const MAX_IMAGE_BYTES = 200_000;

export type ScannedRow = {
  /** Of the rows on the page, from 0. */
  row: number;
  /** Thousandths, the final grade when the rule has one attempt. */
  value?: number;
  /** Thousandths, when the rule has several. */
  attempts?: number[];
  confidence: number;
  image: Uint8Array<ArrayBuffer>;
};

/**
 * The rows of a page of the judging sheets, from the code of its QR code. SHEET_CHANGED when the
 * list is not the one printed any more, as the grades would end up with the wrong starters.
 */
export async function getScannedSheet(competitionId: string, code: string) {
  const page = parseSheetCode(code);
  if (!page) throw new DomainError('NOT_FOUND');
  const { divisions, apparatus } = await getGradingState(competitionId, {
    divisionIds: page.divisionIds,
  });
  if (divisions.length !== page.divisionIds.length) throw new DomainError('NOT_FOUND');
  // Only the grading page of running divisions shows scanned grades for checking.
  if (divisions.some(({ state }) => state !== 'RUNNING')) {
    throw new DomainError('DIVISION_NOT_RUNNING');
  }
  const slots = apparatus.find((item) => item.apparatus === page.apparatus)?.rounds[page.round]
    ?.slots;
  if (!slots) throw new DomainError('NOT_FOUND');
  const rows = slots.slice(page.offset, page.offset + SHEET.rowsPerPage);
  if (rows.length === 0 || rowsHash(rows.map(({ entryId }) => entryId)) !== page.hash) {
    throw new DomainError('SHEET_CHANGED');
  }
  return {
    apparatus: page.apparatus,
    round: page.round,
    offset: page.offset,
    divisions,
    // As on the sheet: the same columns on every page of a list.
    attempts: Math.max(1, ...slots.map(({ inputRule }) => inputRule.attempts)),
    rows,
  };
}

/**
 * Keeps what was read from a page until an editor checks it, and gives the ids by row. Withdrawn
 * starters are left out, and grades that are saved like that already, e.g. from a tablet.
 */
export async function saveScannedGrades(
  competitionId: string,
  code: string,
  scanned: readonly ScannedRow[],
) {
  const { apparatus, rows } = await getScannedSheet(competitionId, code);
  const kept = scanned.flatMap(({ row, value, attempts, confidence, image }) => {
    const slot = rows[row];
    if (!slot || image.byteLength > MAX_IMAGE_BYTES || !(confidence >= 0 && confidence <= 1)) {
      throw new DomainError('INVALID_INPUT');
    }
    if (slot.withdrawn) return [];
    const grade = computeGrade({ value, attempts }, slot.inputRule);
    if (isSameGrade(slot.grade, grade)) return [];
    return {
      row,
      where: { entryId: slot.entryId, apparatus },
      data: { ...grade, confidence, image },
    };
  });
  const created = await prisma.$transaction(async (tx) => {
    const ids = [];
    for (const { where, data } of kept) {
      // Replaced, not updated: a new id, so its image is not taken from the cache.
      await tx.scannedGrade.deleteMany({ where });
      ids.push((await tx.scannedGrade.create({ data: { ...where, ...data } })).id);
    }
    return ids;
  });
  publish(competitionId, 'grades');
  return kept.map(({ row }, index) => ({ row, id: created[index] }));
}

export async function discardScannedGrade(competitionId: string, id: string) {
  // Already gone is fine, e.g. saved on another device.
  await prisma.scannedGrade.deleteMany({
    where: { id, entry: { contest: { competitionId } } },
  });
  publish(competitionId, 'grades');
}

/** The handwriting a grade was read from, or null. */
export async function getScanImage(competitionId: string, id: string) {
  const scanned = await prisma.scannedGrade.findFirst({
    where: { id, entry: { contest: { competitionId } } },
    select: { image: true },
  });
  return scanned?.image ?? null;
}
