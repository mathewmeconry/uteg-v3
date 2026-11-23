import { createDisplay, getOrCreateJudgeLinks } from '~/lib/access.server';
import { APP_ORIGIN } from '~/lib/env.server';
import { prisma } from '~/lib/prisma.server';
import { createCompetition, truncateTables } from '~/tests/helpers';
import { callAction, contextFor, statusOf } from '~/tests/routeContext';
import { action, loader } from './displays';

beforeEach(truncateTables);

async function setup(role: 'VIEWER' | 'EDITOR' = 'EDITOR') {
  const competition = await createCompetition({ grounds: 2 });
  const display = await createDisplay(competition.id, 2);
  const context = await contextFor(competition, role);
  const post = (fields: Record<string, string>) => callAction(action, context, fields);
  return { competition, display, context, post };
}

function links() {
  return prisma.accessLink.findMany({ orderBy: { id: 'asc' } });
}

describe('loader', () => {
  it('has the address of every display', async () => {
    const { context, display } = await setup();
    const { displays } = await loader({ context } as any);
    const url = `${APP_ORIGIN}/display/${display.id}#${display.token}`;
    expect(displays).toEqual([{ id: display.id, ground: 2, url }]);
  });

  it('keeps the links from viewers', async () => {
    const { context } = await setup('VIEWER');
    expect(await statusOf(async () => loader({ context } as any))).toBe(403);
  });
});

describe('action', () => {
  it('creates, resets and deletes', async () => {
    const { display, post } = await setup();
    expect((await post({ intent: 'create', ground: '1' })).status).toBe(200);
    expect(await links()).toHaveLength(2);

    expect((await post({ intent: 'reset', link: display.id })).status).toBe(200);
    const reset = await prisma.accessLink.findUniqueOrThrow({ where: { id: display.id } });
    expect(reset.token).not.toBe(display.token);

    expect((await post({ intent: 'delete', link: display.id })).status).toBe(200);
    expect(await links()).toMatchObject([{ ground: 1 }]);
  });

  it.each([{ ground: '3' }, { ground: 'x' }, {}])('rejects %j', async (fields) => {
    const { post } = await setup();
    expect((await post({ intent: 'create', ...(fields as any) })).status).toBe(400);
    expect(await links()).toHaveLength(1);
  });

  it('is denied to viewers', async () => {
    const { display, post } = await setup('VIEWER');
    const before = await links();
    for (const intent of ['create', 'reset', 'delete']) {
      expect((await post({ intent, link: display.id, ground: '1' })).status).toBe(403);
    }
    expect(await links()).toEqual(before);
  });

  it('denies links of other competitions and judges', async () => {
    const { competition, post } = await setup();
    const foreign = await createDisplay((await createCompetition()).id, 1);
    const [judge] = await getOrCreateJudgeLinks(competition.id);
    const before = await links();
    for (const link of [foreign.id, judge.id, 'nope']) {
      expect((await post({ intent: 'reset', link })).status).toBe(404);
      expect((await post({ intent: 'delete', link })).status).toBe(404);
    }
    expect(await links()).toEqual(before);
  });
});
