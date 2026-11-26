import { inflateSync } from 'node:zlib';
import type { Prisma } from '~/generated/prisma/client';
import { prisma } from './prisma.server';

export async function setKeepHandwriting(competitionId: string, keep: boolean) {
  await prisma.competition.update({
    where: { id: competitionId },
    data: { keepHandwriting: keep },
  });
}

/**
 * Turns the cells of scanned grades into samples, as an editor now saves these grades: what is
 * written in them is checked. Call before the scanned grades are removed. Each cell gets its
 * attempt, the last column of a sheet with attempts the final grade.
 */
export async function keepHandwriting(
  tx: Prisma.TransactionClient,
  competitionId: string,
  saved: readonly { entryId: string; apparatus: string; value: number; attempts: number[] }[],
) {
  const competition = await tx.competition.findUniqueOrThrow({
    where: { id: competitionId },
    select: { keepHandwriting: true },
  });
  if (!competition.keepHandwriting || saved.length === 0) return;
  const scans = await tx.scannedGrade.findMany({
    where: {
      OR: saved.map(({ entryId, apparatus }) => ({ entryId, apparatus })),
      NOT: { cells: { isEmpty: true } },
    },
  });
  const samples = scans.flatMap((scan) => {
    const grade = saved.find(
      ({ entryId, apparatus }) => entryId === scan.entryId && apparatus === scan.apparatus,
    )!;
    const final = scan.cells.length - 1;
    return scan.cells.flatMap((ink, column) => {
      const isFinal = column === final;
      // A grade without attempts on a sheet with them is only known for the final grade.
      const value = isFinal ? grade.value : grade.attempts[column];
      if (ink.length === 0 || value === undefined) return [];
      const read = isFinal ? scan.value : scan.attempts[column];
      return {
        competitionId,
        ink,
        width: scan.cellWidth,
        height: scan.cellHeight,
        value,
        read: read ?? null,
      };
    });
  });
  if (samples.length > 0) await tx.handwritingSample.createMany({ data: samples });
}

/** The samples as grey images, ink black, with what is written in them. */
export async function listHandwritingSamples(competitionId?: string) {
  const samples = await prisma.handwritingSample.findMany({
    where: { competitionId },
    orderBy: { id: 'asc' },
  });
  return samples.map(({ id, ink, width, height, value, read }) => {
    const bits = inflateSync(ink);
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
