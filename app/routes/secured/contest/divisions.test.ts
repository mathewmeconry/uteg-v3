import { prisma } from '~/lib/prisma.server';
import { createCompetition, createDivision, createStarter, truncateTables } from '~/tests/helpers';
import { callAction, contextFor } from '~/tests/routeContext';
import { action, loader } from './divisions';

beforeEach(truncateTables);

async function setup(role: 'VIEWER' | 'EDITOR' = 'EDITOR') {
  const competition = await createCompetition({ grounds: 2 });
  const division = await createDivision(competition.contest.id);
  const context = await contextFor(competition, role);
  const post = (fields: Record<string, string | string[]>) => callAction(action, context, fields);
  const state = async (id = division.id) =>
    (await prisma.division.findUniqueOrThrow({ where: { id } })).state;
  return { competition, division, context, post, state };
}

/** A second contest of the same competition with a division. */
async function otherContest(competitionId: string) {
  const { module, config } = await prisma.contest.findFirstOrThrow({ where: { competitionId } });
  const contest = await prisma.contest.create({
    data: { competitionId, module, config: config as object, name: 'Final', position: 1 },
  });
  return createDivision(contest.id, { state: 'RUNNING', ground: 2 });
}

describe('loader', () => {
  it('has the divisions of the contest and what else runs', async () => {
    const { competition, division, context } = await setup('VIEWER');
    const final = await otherContest(competition.id);
    await createStarter(competition.id, { divisionId: division.id });
    const result = await loader({ context } as any);
    expect(result.divisions).toMatchObject([{ id: division.id, unassignedCount: 1 }]);
    expect(result.running).toMatchObject([{ id: final.id, ground: 2 }]);
    expect(result.categories.FEMALE).toContain('KD');
  });
});

describe('action', () => {
  it('is denied to viewers', async () => {
    const { division, post, state } = await setup('VIEWER');
    for (const intent of ['create', 'ground', 'move', 'delete', 'start', 'stop']) {
      const fields = { intent, division: division.id, sex: 'MALE', category: 'K5', ground: '2' };
      expect((await post(fields)).status).toBe(403);
    }
    expect(await state()).toBe('PENDING');
    expect(await prisma.division.findMany()).toMatchObject([{ ground: 1 }]);
  });

  it('creates divisions', async () => {
    const { post } = await setup();
    const fields = { intent: 'create', sex: 'FEMALE', category: 'K5', ground: '2' };
    const { status, toasts } = await post(fields);
    expect(status).toBe(200);
    expect(toasts).toMatchObject([{ type: 'success', message: expect.stringContaining('2') }]);
    expect(await prisma.division.findFirst({ where: { number: 2 } })).toMatchObject({ ground: 2 });
  });

  it.each([
    { intent: 'create', sex: 'FEMALE', category: 'KH', ground: '1' },
    { intent: 'create', sex: 'FEMALE', category: 'K5', ground: '3' },
    { intent: 'create', sex: 'X', category: 'K5', ground: '1' },
    { intent: 'start' },
    { intent: 'nope' },
  ])('rejects %j', async (fields) => {
    const { post } = await setup();
    const result = await post(fields as any);
    expect(result).toMatchObject({ status: 400, error: expect.any(String), toasts: [] });
    expect(await prisma.division.count()).toBe(1);
  });

  it('changes the ground and deletes', async () => {
    const { division, post } = await setup();
    await post({ intent: 'ground', division: division.id, ground: '2' });
    expect(await prisma.division.findFirst()).toMatchObject({ ground: 2 });
    await post({ intent: 'delete', division: division.id });
    expect(await prisma.division.count()).toBe(0);
  });

  it('moves without a toast', async () => {
    const { competition, division, post } = await setup();
    const second = await createDivision(competition.contest.id, { number: 2 });
    const fields = { intent: 'move', division: second.id, ground: '1', before: division.id };
    expect(await post(fields)).toMatchObject({ status: 200, toasts: [] });
    const order = await prisma.division.findMany({ orderBy: { position: 'asc' } });
    expect(order.map(({ id }) => id)).toEqual([second.id, division.id]);
  });

  it('deletes several or none', async () => {
    const { competition, division, post } = await setup();
    const second = await createDivision(competition.contest.id, { number: 2 });
    const third = await createDivision(competition.contest.id, { number: 3, state: 'RUNNING' });
    expect((await post({ intent: 'delete', division: [second.id, third.id] })).status).toBe(400);
    expect(await prisma.division.count()).toBe(3);
    expect((await post({ intent: 'delete', division: [division.id, second.id] })).status).toBe(200);
    expect(await prisma.division.findMany()).toMatchObject([{ id: third.id, number: 1 }]);
  });

  it('starts and stops several', async () => {
    const { competition, division, post, state } = await setup();
    const second = await createDivision(competition.contest.id, { number: 2 });
    const ids = [division.id, second.id];
    expect((await post({ intent: 'start', division: ids })).status).toBe(200);
    expect([await state(), await state(second.id)]).toEqual(['RUNNING', 'RUNNING']);
    expect((await post({ intent: 'stop', division: ids })).status).toBe(200);
    expect([await state(), await state(second.id)]).toEqual(['PENDING', 'PENDING']);
  });

  it('only restarts ended divisions when asked to, and keeps the grades', async () => {
    const { competition, post, state } = await setup();
    const ended = await createDivision(competition.contest.id, { number: 2, state: 'ENDED' });
    await createStarter(competition.id, {
      divisionId: ended.id,
      startApparatus: 'reck',
      grades: { reck: 9000 },
    });
    expect((await post({ intent: 'start', division: ended.id })).status).toBe(400);
    expect(await state(ended.id)).toBe('ENDED');
    expect((await post({ intent: 'start', division: ended.id, restart: 'true' })).status).toBe(200);
    expect(await state(ended.id)).toBe('RUNNING');
    expect(await prisma.grade.count()).toBe(1);
  });

  it('denies divisions of other competitions and contests', async () => {
    const { competition, division, post, state } = await setup();
    const other = await createCompetition({ grounds: 2 });
    const foreign = await createDivision(other.contest.id);
    const final = await otherContest(competition.id);
    for (const id of [foreign.id, final.id, 'nope']) {
      const before = await prisma.division.findMany({ orderBy: { id: 'asc' } });
      for (const intent of ['ground', 'move', 'delete', 'start', 'stop']) {
        const result = await post({ intent, division: id, ground: '1' });
        expect(result).toMatchObject({ status: 404, error: 'Nicht gefunden.' });
      }
      expect(await prisma.division.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    }
    // One foreign id spoils the whole request.
    expect((await post({ intent: 'start', division: [division.id, foreign.id] })).status).toBe(404);
    expect(await state()).toBe('PENDING');
  });
});
