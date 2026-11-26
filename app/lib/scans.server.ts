import { isSameGrade } from './domain/gradeInput';
import { DomainError } from './errors';
import { publish } from './events.server';
import { computeGrade, getGradingState } from './judging.server';
import { SHEET } from './judgingSheet';
import { prisma } from './prisma.server';
import { pageHash, parseSheetCode } from './sheetCode.server';

/** The largest image of a row's handwriting. The scan page sends far smaller ones. */
export const MAX_IMAGE_BYTES = 200_000;

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
  // As on the sheet: the same columns on every page of a list.
  const attempts = Math.max(1, ...slots.map(({ inputRule }) => inputRule.attempts));
  const entryIds = rows.map(({ entryId }) => entryId);
  if (rows.length === 0 || pageHash(entryIds, attempts) !== page.hash) {
    throw new DomainError('SHEET_CHANGED');
  }
  return {
    apparatus: page.apparatus,
    round: page.round,
    offset: page.offset,
    divisions,
    attempts,
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
  if (new Set(scanned.map(({ row }) => row)).size !== scanned.length) {
    throw new DomainError('INVALID_INPUT');
  }
  const kept = scanned.flatMap(({ row, value, attempts, confidence, image }) => {
    const slot = rows[row];
    if (!slot || image.byteLength > MAX_IMAGE_BYTES || !(confidence >= 0 && confidence <= 1)) {
      throw new DomainError('INVALID_INPUT');
    }
    if (slot.withdrawn) return [];
    const grade = computeGrade({ value, attempts }, slot.inputRule);
    return { row, entryId: slot.entryId, grade, data: { ...grade, confidence, image } };
  });
  const created = await prisma.$transaction(async (tx) => {
    const ids = kept.map(({ entryId }) => entryId);
    // Two uploads of a page take turns, and a grade saved meanwhile is seen, in the order
    // saveGrades locks in.
    await tx.$queryRaw`
      SELECT id FROM entry WHERE id = ANY(${ids}::text[]) ORDER BY id FOR NO KEY UPDATE`;
    const saved = await tx.grade.findMany({ where: { entryId: { in: ids }, apparatus } });
    const result = [];
    for (const { row, entryId, grade, data } of kept) {
      const current = saved.find((item) => item.entryId === entryId) ?? null;
      if (isSameGrade(current, grade)) continue;
      const where = { entryId, apparatus };
      // Replaced, not updated: a new id, so its image is not taken from the cache.
      await tx.scannedGrade.deleteMany({ where });
      result.push({ row, id: (await tx.scannedGrade.create({ data: { ...where, ...data } })).id });
    }
    return result;
  });
  publish(competitionId, 'grades');
  return created;
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
