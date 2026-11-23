import {
  MAX_COVER_PAGE_BYTES,
  MAX_COVER_PAGES,
  readCoverPage,
  type CoverImage,
} from './domain/cover';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

/**
 * Replaces the cover with these pages. The browser makes them of the file the user picked, see
 * components/ranking/coverPages.client.ts, so they are always JPEGs.
 */
export async function setCover(competitionId: string, templateId: string, files: Uint8Array[]) {
  if (files.length === 0) throw new DomainError('INVALID_COVER');
  if (files.length > MAX_COVER_PAGES) throw new DomainError('COVER_TOO_MANY_PAGES');
  if (files.some(({ byteLength }) => byteLength > MAX_COVER_PAGE_BYTES)) {
    throw new DomainError('FILE_TOO_LARGE');
  }
  const pages = files.map((file) => {
    const page = readCoverPage(file);
    if (!page) throw new DomainError('INVALID_COVER');
    return page;
  });

  await replacePages(competitionId, templateId, pages);
}

export async function removeCover(competitionId: string, templateId: string) {
  await replacePages(competitionId, templateId, []);
}

/** Templates with pages that are cut off or no JPEGs. Such pages are left out of PDFs. */
export async function findBrokenCovers(competitionId: string) {
  const rows = await prisma.$queryRaw<{ templateId: string }[]>`
    SELECT DISTINCT "templateId" FROM asset
    WHERE "competitionId" = ${competitionId} AND "templateId" IS NOT NULL
      AND (substring(data FROM 1 FOR 2) <> '\\xffd8'::bytea
        OR substring(data FROM greatest(octet_length(data) - 1, 1)) <> '\\xffd9'::bytea)`;
  return new Set(rows.map(({ templateId }) => templateId));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function replacePages(competitionId: string, templateId: string, pages: CoverImage[]) {
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const template = await tx.rankingTemplate.findFirst({
      where: { id: templateId, competitionId },
    });
    if (!template) throw new DomainError('NOT_FOUND');
    await tx.asset.deleteMany({ where: { templateId } });
    await tx.asset.createMany({
      data: pages.map(({ data }, position) => ({
        competitionId,
        templateId,
        position,
        mimeType: 'image/jpeg',
        data,
      })),
    });
  });
  publish(competitionId, 'settings');
}
