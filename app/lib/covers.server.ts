import type { Prisma } from '~/generated/prisma/client';
import { runPdfJob } from '~/pdf/render.server';
import { detectMimeType } from './assets.server';
import { MAX_COVER_BYTES, MAX_COVER_MEGAPIXELS } from './domain/cover';
import { readImageSize } from './domain/imageSize';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

/** Uploads or replaces the cover. Only a PDF made from the file is stored, see pdf/cover.tsx. */
export async function setCover(
  competitionId: string,
  templateId: string,
  file: Uint8Array,
  signal?: AbortSignal,
) {
  await getCoverId(prisma, competitionId, templateId);
  const mimeType = checkCover(file);
  const { pdf } = await runPdfJob({ type: 'cover', data: file, mimeType }, { signal });

  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const oldId = await getCoverId(tx, competitionId, templateId);
    const { id } = await tx.asset.create({
      data: { competitionId, mimeType: 'application/pdf', data: new Uint8Array(pdf) },
      select: { id: true },
    });
    await tx.rankingTemplate.update({ where: { id: templateId }, data: { coverId: id } });
    if (oldId) await tx.asset.delete({ where: { id: oldId }, select: { id: true } });
  });
  publish(competitionId, 'settings');
}

export async function removeCover(competitionId: string, templateId: string) {
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const id = await getCoverId(tx, competitionId, templateId);
    if (id) await tx.asset.delete({ where: { id }, select: { id: true } });
  });
  publish(competitionId, 'settings');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function checkCover(file: Uint8Array) {
  if (file.byteLength > MAX_COVER_BYTES) throw new DomainError('FILE_TOO_LARGE');
  const mimeType = detectMimeType(file);
  if (!mimeType) throw new DomainError('INVALID_COVER');
  if (mimeType !== 'application/pdf') {
    const size = readImageSize(file);
    if (!size) throw new DomainError('INVALID_COVER');
    if (size.width * size.height > MAX_COVER_MEGAPIXELS * 1e6) {
      throw new DomainError('COVER_TOO_MANY_PIXELS');
    }
  }
  return mimeType;
}

async function getCoverId(tx: Prisma.TransactionClient, competitionId: string, templateId: string) {
  const template = await tx.rankingTemplate.findFirst({ where: { id: templateId, competitionId } });
  if (!template) throw new DomainError('NOT_FOUND');
  return template.coverId;
}
