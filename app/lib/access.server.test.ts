import type { AccessLink } from '~/generated/prisma/client';
import { createCompetition, errorCode, truncateTables } from '~/tests/helpers';
import {
  accessUrl,
  createAccessCookie,
  createDisplay,
  deleteDisplay,
  getOrCreateJudgeLinks,
  hasAccessToCompetition,
  listDisplays,
  resetAllTokens,
  resetToken,
  resolveAccess,
} from './access.server';
import { subscribe } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

beforeEach(truncateTables);

function requestWith(cookie: string | null) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie.split(';')[0]);
  return new Request('http://localhost', { headers });
}

async function opens({ id, kind, token }: AccessLink) {
  return (await createAccessCookie(id, kind, token)) !== null;
}

describe('getOrCreateJudgeLinks', () => {
  it('has one link per ground and apparatus and stays the same', async () => {
    const { id } = await createCompetition({ grounds: 2 });
    const [links] = await Promise.all([getOrCreateJudgeLinks(id), getOrCreateJudgeLinks(id)]);
    expect(links.map(({ ground, apparatus }) => `${ground} ${apparatus}`)).toEqual(
      [1, 2].flatMap((ground) =>
        ['reck', 'boden', 'schaukelringe', 'sprung', 'barren'].map((key) => `${ground} ${key}`),
      ),
    );
    expect(await getOrCreateJudgeLinks(id)).toEqual(links);
  });

  it('uses long random tokens', async () => {
    const { id } = await createCompetition();
    const links = await getOrCreateJudgeLinks(id);
    for (const { token } of links) expect(token).toMatch(/^[\w-]{43}$/);
    expect(new Set(links.map(({ token }) => token)).size).toBe(links.length);
  });

  it('rejects an unknown competition', async () => {
    expect(await errorCode(getOrCreateJudgeLinks('nope'))).toBe('NOT_FOUND');
  });

  it('creates no links for grounds that are being removed', async () => {
    const { id } = await createCompetition({ grounds: 2 });
    let links!: ReturnType<typeof getOrCreateJudgeLinks>;
    await prisma.$transaction(async (tx) => {
      await lockCompetition(tx, id);
      await tx.competition.update({ where: { id }, data: { grounds: 1 } });
      links = getOrCreateJudgeLinks(id);
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(await links).toHaveLength(5);
    expect(await prisma.accessLink.count()).toBe(5);
  });
});

describe('displays', () => {
  it('creates several per ground, lists and deletes them', async () => {
    const { id } = await createCompetition();
    const display = await createDisplay(id, 1);
    await createDisplay(id, 1);
    expect(await listDisplays(id)).toHaveLength(2);
    await deleteDisplay(id, display.id);
    expect(await listDisplays(id)).toHaveLength(1);
    expect(await opens(display)).toBe(false);
  });

  it.each([0, 2, 1.5])('rejects ground %s', async (ground) => {
    const { id } = await createCompetition();
    expect(await errorCode(createDisplay(id, ground))).toBe('INVALID_GROUND');
  });

  it('does not delete links of others or judge links', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const display = await createDisplay(other.id, 1);
    const [judge] = await getOrCreateJudgeLinks(id);
    expect(await errorCode(deleteDisplay(id, display.id))).toBe('NOT_FOUND');
    expect(await errorCode(deleteDisplay(id, judge.id))).toBe('NOT_FOUND');
  });
});

describe('using a link', () => {
  it('has the key after "#" and nowhere else', async () => {
    const { id } = await createCompetition();
    const display = await createDisplay(id, 1);
    const { pathname, hash, search } = new URL(accessUrl(display));
    expect(pathname).toBe(`/display/${display.id}`);
    expect(hash).toBe(`#${display.token}`);
    expect(search).toBe('');
  });

  it('gets a cookie for the key and opens the link with it', async () => {
    const { id } = await createCompetition();
    const [judge, other] = await getOrCreateJudgeLinks(id);
    const cookie = await createAccessCookie(judge.id, 'JUDGE', judge.token);
    expect(cookie).toMatch(new RegExp(`^uteg_access_${judge.id}=`));
    expect(cookie).toMatch(/; Path=\/; HttpOnly; SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=31536000/);

    const request = requestWith(cookie);
    expect(await resolveAccess(request, judge.id, 'JUDGE')).toMatchObject({
      competitionId: id,
      ground: 1,
      apparatus: 'reck',
    });
    expect(await resolveAccess(request, judge.id, 'DISPLAY')).toBeNull();
    expect(await resolveAccess(request, other.id, 'JUDGE')).toBeNull();
    expect(await resolveAccess(requestWith(null), judge.id, 'JUDGE')).toBeNull();
  });

  it('does not accept the key of another link under its name', async () => {
    const { id } = await createCompetition();
    const [judge, other] = await getOrCreateJudgeLinks(id);
    const cookie = (await createAccessCookie(other.id, 'JUDGE', other.token))!;
    const forged = requestWith(cookie.replace(other.id, judge.id));
    expect(await resolveAccess(forged, judge.id, 'JUDGE')).toBeNull();
  });

  it.each([undefined, null, '', 'nope', 'a\0', '\0'.repeat(43), 1])(
    'gets no cookie for the key %j',
    async (token) => {
      const { id } = await createCompetition();
      const [judge] = await getOrCreateJudgeLinks(id);
      expect(await createAccessCookie(judge.id, 'JUDGE', token)).toBeNull();
    },
  );

  it.each(['', 'nope', 'a\0', '\0'.repeat(26), 'a;b', '0'.repeat(26)])(
    'does not know the link %j',
    async (linkId) => {
      expect(await createAccessCookie(linkId, 'JUDGE', 'x')).toBeNull();
      expect(await resolveAccess(requestWith(null), linkId, 'JUDGE')).toBeNull();
    },
  );

  it('opens the images of its competition', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const display = await createDisplay(id, 1);
    const request = requestWith(await createAccessCookie(display.id, 'DISPLAY', display.token));
    expect(await hasAccessToCompetition(request, id)).toBe(true);
    expect(await hasAccessToCompetition(request, other.id)).toBe(false);
    expect(await hasAccessToCompetition(requestWith(null), id)).toBe(false);
    await resetToken(id, display.id);
    expect(await hasAccessToCompetition(request, id)).toBe(false);
  });
});

describe('resetToken', () => {
  it('locks out the old link and tells open streams', async () => {
    const { id } = await createCompetition();
    const [judge, other] = await getOrCreateJudgeLinks(id);
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    const { token } = await resetToken(id, judge.id);
    stop();
    expect(await opens(judge)).toBe(false);
    expect(await opens({ ...judge, token })).toBe(true);
    expect(await opens(other)).toBe(true);
    expect(listener).toHaveBeenCalledWith('settings');
  });

  it('does not reset links of other competitions', async () => {
    const { id } = await createCompetition();
    const [link] = await getOrCreateJudgeLinks((await createCompetition()).id);
    expect(await errorCode(resetToken(id, link.id))).toBe('NOT_FOUND');
  });
});

describe('resetAllTokens', () => {
  it('replaces all tokens of one kind', async () => {
    const { id } = await createCompetition();
    const other = await getOrCreateJudgeLinks((await createCompetition()).id);
    const display = await createDisplay(id, 1);
    const before = await getOrCreateJudgeLinks(id);
    await resetAllTokens(id, 'JUDGE');
    const after = await getOrCreateJudgeLinks(id);
    expect(after.map((link) => link.id)).toEqual(before.map((link) => link.id));
    for (const link of before) expect(await opens(link)).toBe(false);
    expect(await opens(display)).toBe(true);
    expect(await opens(other[0])).toBe(true);
  });
});
