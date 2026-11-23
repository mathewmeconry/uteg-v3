import { createDisplay, getOrCreateJudgeLinks } from '~/lib/access.server';
import { APP_ORIGIN } from '~/lib/env.server';
import { prisma } from '~/lib/prisma.server';
import { createCompetition, truncateTables } from '~/tests/helpers';
import { callAction, contextFor, statusOf } from '~/tests/routeContext';
import { action, loader } from './judges';

beforeEach(truncateTables);

async function setup(role: 'VIEWER' | 'EDITOR' = 'EDITOR') {
  const competition = await createCompetition({ grounds: 2 });
  const links = await getOrCreateJudgeLinks(competition.id);
  const context = await contextFor(competition, role);
  const post = (fields: Record<string, string>) => callAction(action, context, fields);
  return { competition, links, context, post };
}

function tokens() {
  return prisma.accessLink.findMany({ select: { id: true, token: true }, orderBy: { id: 'asc' } });
}

describe('loader', () => {
  it('has the address of every link', async () => {
    const { context, links } = await setup();
    const result = await loader({ context } as any);
    expect(result.links).toHaveLength(10);
    expect(result.links[0]).toEqual({
      id: links[0].id,
      ground: 1,
      apparatus: 'reck',
      url: `${APP_ORIGIN}/judge/${links[0].id}#${links[0].token}`,
    });
  });

  it('keeps the links from viewers', async () => {
    const { context } = await setup('VIEWER');
    expect(await statusOf(async () => loader({ context } as any))).toBe(403);
  });
});

describe('action', () => {
  it('resets one link or all', async () => {
    const { links, post } = await setup();
    const before = await tokens();
    expect((await post({ intent: 'reset', link: links[0].id })).status).toBe(200);
    const after = await tokens();
    const changed = after.filter(({ token }) => !before.some((link) => link.token === token));
    expect(changed.map(({ id }) => id)).toEqual([links[0].id]);

    expect((await post({ intent: 'resetAll' })).status).toBe(200);
    const all = await tokens();
    expect(all.some(({ token }) => after.some((link) => link.token === token))).toBe(false);
  });

  it('resets all links of a ground', async () => {
    const { post } = await setup();
    const before = await prisma.accessLink.findMany();
    expect((await post({ intent: 'resetAll', ground: '2' })).status).toBe(200);
    for (const { id, ground, token } of before) {
      const after = await prisma.accessLink.findUniqueOrThrow({ where: { id } });
      expect(after.token === token).toBe(ground === 1);
    }
    expect((await post({ intent: 'resetAll', ground: 'x' })).status).toBe(400);
  });

  it('is denied to viewers', async () => {
    const { links, post } = await setup('VIEWER');
    const before = await tokens();
    expect((await post({ intent: 'reset', link: links[0].id })).status).toBe(403);
    expect((await post({ intent: 'resetAll' })).status).toBe(403);
    expect(await tokens()).toEqual(before);
  });

  it('denies links of other competitions and displays', async () => {
    const { competition, post } = await setup();
    const [foreign] = await getOrCreateJudgeLinks((await createCompetition()).id);
    const display = await createDisplay(competition.id, 1);
    const before = await tokens();
    for (const link of [foreign.id, display.id, 'nope']) {
      const result = await post({ intent: 'reset', link });
      expect(result).toMatchObject({ status: 404, error: 'Nicht gefunden.' });
    }
    expect((await post({ intent: 'reset' })).status).toBe(400);
    expect(await tokens()).toEqual(before);
  });
});
