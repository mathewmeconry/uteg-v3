import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const SIGNATURES = [
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

export function getLogo(competitionId: string) {
  return prisma.asset.findFirst({ where: { competitionId, logoOf: { id: competitionId } } });
}

/** Throws unless the image can be a logo. Returns its type. */
export function checkLogo(data: Uint8Array) {
  if (data.byteLength > MAX_LOGO_BYTES) throw new DomainError('FILE_TOO_LARGE');
  const mimeType = detectMimeType(data);
  if (!mimeType) throw new DomainError('INVALID_IMAGE');
  return mimeType;
}

export async function setLogo(competitionId: string, data: Uint8Array<ArrayBuffer>) {
  const mimeType = checkLogo(data);
  const asset = await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    await tx.asset.deleteMany({ where: { logoOf: { id: competitionId } } });
    const { id } = await tx.asset.create({
      data: { competitionId, mimeType, data },
      select: { id: true },
    });
    await tx.competition.update({ where: { id: competitionId }, data: { logoId: id } });
    return { id, mimeType };
  });
  publish(competitionId, 'settings');
  return asset;
}

export async function removeLogo(competitionId: string) {
  await prisma.asset.deleteMany({ where: { logoOf: { id: competitionId } } });
  publish(competitionId, 'settings');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** File names and the browser's content type can be anything, so look at the content. */
function detectMimeType(data: Uint8Array) {
  return SIGNATURES.find(({ bytes }) => bytes.every((byte, index) => data[index] === byte))
    ?.mimeType;
}
