import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createCookie } from 'react-router';
import type { AccessKind, AccessLink } from '~/generated/prisma/client';
import { getContestsApparatus } from '~/modules/registry';
import { APP_ORIGIN } from './env.server';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

/** One link per ground and apparatus, missing ones are created. */
export async function getOrCreateJudgeLinks(competitionId: string) {
  return prisma.$transaction(async (tx) => {
    // Someone else may open the page or remove a ground at the same time.
    const { grounds } = await lockCompetition(tx, competitionId);
    const contests = await tx.contest.findMany({
      where: { competitionId },
      orderBy: { position: 'asc' },
    });
    const apparatusList = getContestsApparatus(contests);
    const wanted = Array.from({ length: grounds }, (_, index) =>
      apparatusList.map((apparatus) => ({ ground: index + 1, apparatus })),
    ).flat();

    const links = await tx.accessLink.findMany({ where: { competitionId, kind: 'JUDGE' } });
    const result = [];
    for (const { ground, apparatus } of wanted) {
      result.push(
        links.find((link) => link.ground === ground && link.apparatus === apparatus) ??
          (await tx.accessLink.create({
            data: { competitionId, kind: 'JUDGE', ground, apparatus, token: createToken() },
          })),
      );
    }
    return result;
  });
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

/** Replaces the token. The old link stops working at once. */
export async function resetToken(competitionId: string, linkId: string) {
  const [link] = await prisma.accessLink.updateManyAndReturn({
    where: { id: linkId, competitionId },
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

// ── Using a link ─────────────────────────────────────────────────────────────

/** The address behind the QR code. Browsers never send the part after "#", so no log has the key. */
export function accessUrl({ id, kind, token }: Pick<AccessLink, 'id' | 'kind' | 'token'>) {
  return `${APP_ORIGIN}/${kind.toLowerCase()}/${id}#${token}`;
}

/**
 * The cookie that opens the link on this device, null when the token is wrong. The token is what
 * follows "#" in accessUrl.
 */
export async function createAccessCookie(linkId: string, kind: AccessKind, token: unknown) {
  if (!(await checkToken(linkId, kind, token))) return null;
  return accessCookie(linkId).serialize(token);
}

/** The link that the request's cookie opens. Null without one, after a reset, for another kind. */
export async function resolveAccess(request: Request, linkId: string, kind: AccessKind) {
  const token: unknown = await accessCookie(linkId).parse(request.headers.get('Cookie'));
  return checkToken(linkId, kind, token);
}

/** Whether a cookie of the request opens any link of the competition. */
export async function hasAccessToCompetition(request: Request, competitionId: string) {
  const header = request.headers.get('Cookie') ?? '';
  const ids = new Set([...header.matchAll(COOKIE_NAMES)].map(([, id]) => id));
  const links = await prisma.accessLink.findMany({
    where: { id: { in: [...ids] }, competitionId },
  });
  for (const { id, kind } of links) if (await resolveAccess(request, id, kind)) return true;
  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LINK_ID = /^\w{26}$/;
const COOKIE_PREFIX = 'uteg_access_';
const COOKIE_NAMES = new RegExp(`${COOKIE_PREFIX}(\\w{26})=`, 'g');

function accessCookie(linkId: string) {
  return createCookie(COOKIE_PREFIX + linkId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: APP_ORIGIN.startsWith('https:'),
    maxAge: 60 * 60 * 24 * 365,
  });
}

async function checkToken(linkId: string, kind: AccessKind, token: unknown) {
  if (!LINK_ID.test(linkId) || typeof token !== 'string') return null;
  const link = await prisma.accessLink.findFirst({ where: { id: linkId, kind } });
  return link && timingSafeEqual(hash(token), hash(link.token)) ? link : null;
}

function hash(text: string) {
  return createHash('sha256').update(text).digest();
}

function createToken() {
  return randomBytes(32).toString('base64url');
}
