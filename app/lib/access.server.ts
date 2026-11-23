import { randomBytes } from 'node:crypto';
import type { AccessKind } from '~/generated/prisma/client';
import { getContestsApparatus } from '~/modules/registry';
import { env } from './env.server';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

/** One link per ground and apparatus, missing ones are created. */
export async function getOrCreateJudgeLinks(competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { contests: { orderBy: { position: 'asc' } } },
  });
  if (!competition) throw new DomainError('NOT_FOUND');

  const apparatusList = getContestsApparatus(competition.contests);
  const wanted = Array.from({ length: competition.grounds }, (_, index) =>
    apparatusList.map((apparatus) => ({ ground: index + 1, apparatus })),
  ).flat();

  const links = await prisma.accessLink.findMany({ where: { competitionId, kind: 'JUDGE' } });
  const find = (list: typeof links, { ground, apparatus }: (typeof wanted)[number]) =>
    list.find((link) => link.ground === ground && link.apparatus === apparatus);

  const missing = wanted.filter((link) => !find(links, link));
  if (missing.length === 0) return wanted.map((link) => find(links, link)!);

  await prisma.accessLink.createMany({
    data: missing.map((link) => ({
      ...link,
      competitionId,
      kind: 'JUDGE' as const,
      token: createToken(),
    })),
    // Someone else may have opened the page at the same time.
    skipDuplicates: true,
  });
  const all = await prisma.accessLink.findMany({ where: { competitionId, kind: 'JUDGE' } });
  return wanted.map((link) => find(all, link)!);
}

export function listDisplays(competitionId: string) {
  return prisma.accessLink.findMany({
    where: { competitionId, kind: 'DISPLAY' },
    orderBy: [{ ground: 'asc' }, { id: 'asc' }],
  });
}

export async function createDisplay(competitionId: string, ground: number) {
  const display = await prisma.$transaction(async (tx) => {
    const competition = await lockCompetition(tx, competitionId);
    if (!Number.isInteger(ground) || ground < 1 || ground > competition.grounds) {
      throw new DomainError('INVALID_GROUND');
    }
    return tx.accessLink.create({
      data: { competitionId, kind: 'DISPLAY', ground, token: createToken() },
    });
  });
  publish(competitionId, 'settings');
  return display;
}

export async function deleteDisplay(competitionId: string, linkId: string) {
  const { count } = await prisma.accessLink.deleteMany({
    where: { id: linkId, competitionId, kind: 'DISPLAY' },
  });
  if (count === 0) throw new DomainError('NOT_FOUND');
  publish(competitionId, 'settings');
}

/** The address that opens a link. Contains the token, so it is as secret as the token. */
export function accessUrl({ kind, id, token }: { kind: AccessKind; id: string; token: string }) {
  return new URL(`/${kind === 'JUDGE' ? 'judge' : 'display'}/${id}#${token}`, env.APP_URL).href;
}

/** Replaces the token. The old link stops working at once. */
export async function resetToken(competitionId: string, kind: AccessKind, linkId: string) {
  const [link] = await prisma.accessLink.updateManyAndReturn({
    where: { id: linkId, competitionId, kind },
    data: { token: createToken() },
  });
  if (!link) throw new DomainError('NOT_FOUND');
  publish(competitionId, 'settings');
  return link;
}

export async function resetAllTokens(competitionId: string, kind: AccessKind) {
  await prisma.$transaction(async (tx) => {
    const links = await tx.accessLink.findMany({ where: { competitionId, kind } });
    for (const { id } of links) {
      await tx.accessLink.updateMany({ where: { id }, data: { token: createToken() } });
    }
  });
  publish(competitionId, 'settings');
}

/** The link a token opens, null for unknown tokens and the wrong kind. */
export async function resolveToken(token: string | null | undefined, kind: AccessKind) {
  // Prisma ignores undefined filters and would return any link.
  if (!token) return null;
  return prisma.accessLink.findFirst({ where: { token, kind } });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createToken() {
  return randomBytes(32).toString('base64url');
}
