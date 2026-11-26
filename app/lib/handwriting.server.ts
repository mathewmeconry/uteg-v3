import { inflateSync } from 'node:zlib';
import type { Prisma } from '~/generated/prisma/client';
import { prisma } from './prisma.server';

/** Turned off, what was kept is deleted, also what waits in scanned grades. */
export async function setKeepHandwriting(competitionId: string, keep: boolean) {
  await prisma.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: competitionId },
      data: { keepHandwriting: keep },
    });
    if (keep) return;
    await tx.handwritingSample.deleteMany({ where: { competitionId } });
    await tx.scannedGrade.updateMany({
      where: { entry: { contest: { competitionId } } },
      data: { cells: [], cellWidth: 0, cellHeight: 0 },
    });
  });
}

/**
 * Turns the cells of scanned grades into samples, as an editor saved them looking at their
 * handwriting: what is written is known. Call before the scanned grades are removed. Each attempt
 * gets its cell. A final grade computed from attempts is not what the judge wrote, so its cell
 * is left out; a single grade gets the cell it was written in.
 */
export async function keepHandwriting(
  tx: Prisma.TransactionClient,
  competitionId: string,
  checked: readonly { scanId: string; value: number; attempts: number[] }[],
) {
  const competition = await tx.competition.findUniqueOrThrow({
    where: { id: competitionId },
    select: { keepHandwriting: true },
  });
  if (!competition.keepHandwriting || checked.length === 0) return;
  const scans = await tx.scannedGrade.findMany({
    where: { id: { in: checked.map(({ scanId }) => scanId) }, NOT: { cells: { isEmpty: true } } },
  });
  const samples = scans.flatMap((scan) => {
    const grade = checked.find(({ scanId }) => scanId === scan.id)!;
    const sample = (column: number, value: number, read: number | undefined) => ({
      competitionId,
      ink: scan.cells[column],
      width: scan.cellWidth,
      height: scan.cellHeight,
      value,
      read: read ?? null,
    });
    if (grade.attempts.length > 0) {
      return grade.attempts.flatMap((value, column) =>
        scan.cells[column]?.length ? sample(column, value, scan.attempts[column]) : [],
      );
    }
    // On sheets with attempts, a single grade may be in the first column instead of the last.
    const final = scan.cells.length - 1;
    const column = scan.cells[final].length > 0 ? final : scan.cells.findIndex((ink) => ink.length);
    return column >= 0 ? sample(column, grade.value, scan.value) : [];
  });
  if (samples.length > 0) await tx.handwritingSample.createMany({ data: samples });
}

/**
 * The samples as grey images, ink black, with what is written in them. Damaged ones are left out
 * instead of stopping the export.
 */
export async function listHandwritingSamples(competitionId?: string) {
  const samples = await prisma.handwritingSample.findMany({
    where: { competitionId },
    orderBy: { id: 'asc' },
  });
  return samples.flatMap(({ id, ink, width, height, value, read }) => {
    const length = Math.ceil((width * height) / 8);
    let bits;
    try {
      bits = inflateSync(ink, { maxOutputLength: length });
    } catch {
      return [];
    }
    if (bits.length !== length) return [];
    const data = new Uint8Array(width * height);
    for (let index = 0; index < data.length; index++) {
      const isInk = (bits[index >> 3] >> (7 - (index & 7))) & 1;
      data[index] = isInk ? 0 : 255;
    }
    // As it is written: the third decimal only when it is not 0.
    const written = (value / 1000).toFixed(value % 10 === 0 ? 2 : 3);
    return { id, image: { width, height, data }, written, isRead: read === value };
  });
}
