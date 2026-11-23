import { RouterContextProvider } from 'react-router';
import { competitionContext, contestContext, toastContext } from '~/context';
import type { Role } from '~/generated/prisma/client';
import { getCompetitionForUser } from '~/lib/competitions.server';
import { getContest } from '~/lib/contests.server';
import { prisma } from '~/lib/prisma.server';
import { action as saveAction } from '~/routes/api/competition/grades';
import {
  addMember,
  createCompetition,
  createDivision,
  createStarter,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { action as divisionAction, loader as divisionLoader } from './divisionGrading';
import { action, loader } from './grading';

beforeEach(truncateTables);

async function setup(role: Role = 'EDITOR', state: 'PENDING' | 'RUNNING' | 'ENDED' = 'RUNNING') {
  const { id, contest } = await createCompetition({ grounds: 2 });
  const division = await createDivision(contest.id, { state });
  const { entry } = await createStarter(id, {
    divisionId: division.id,
    lineupId: division.lineup('reck'),
    grades: { reck: 9000 },
  });
  const user = await createUser();
  await addMember(id, user.id, role);
  const context = new RouterContextProvider();
  context.set(competitionContext, await getCompetitionForUser(user.id, id));
  context.set(contestContext, await getContest(id, contest.id));
  const save = async (patch: object = {}) => {
    const body = {
      intent: 'save',
      entryId: entry.id,
      apparatus: 'reck',
      grade: { value: 9500, attempts: [] },
      previous: { value: 9000, attempts: [] },
      ...patch,
    };
    const request = new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
    return (await saveAction({ request, context, params: {} } as any)).json();
  };
  return { id, contest, division, entry, context, save };
}

function post(run: typeof action | typeof divisionAction, context: any, fields: string[][]) {
  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  const request = new Request('http://localhost', { method: 'POST', body });
  return run({ request, context, params: {} } as any);
}

const toasts = (context: RouterContextProvider) =>
  context.get(toastContext).map(({ type }) => type);

describe('roles', () => {
  it('lets viewers change nothing', async () => {
    const { entry, division, context, save } = await setup('VIEWER');
    const forbidden = { init: { status: 403 } };
    await expect(save()).rejects.toMatchObject(forbidden);
    const remove = [
      ['intent', 'delete'],
      ['entryId', entry.id],
      ['apparatus', 'reck'],
    ];
    const confirm = [
      ['intent', 'confirm'],
      ['ground', '1'],
      ['apparatus', 'reck'],
      ['round', '0'],
      ['divisionIds', division.id],
    ];
    await expect(post(action, context, remove)).rejects.toMatchObject(forbidden);
    await expect(post(divisionAction, context, remove)).rejects.toMatchObject(forbidden);
    await expect(post(action, context, confirm)).rejects.toMatchObject(forbidden);
    expect(await prisma.grade.findFirst()).toMatchObject({ value: 9000 });
  });
});

describe('editing', () => {
  it.each(['PENDING', 'RUNNING', 'ENDED'] as const)('corrects a division that is %s', async (s) => {
    const { save } = await setup('EDITOR', s);
    expect(await save()).toMatchObject({ ok: true });
    expect(await prisma.grade.findFirst()).toMatchObject({ value: 9500 });
  });

  it('notices changes by the tablet', async () => {
    const { save } = await setup();
    expect(await save({ previous: null })).toEqual({ ok: false, code: 'GRADE_CHANGED' });
  });

  it('refuses a round without ground and apparatus', async () => {
    const { save } = await setup();
    const reply = await save({ intent: 'confirm', round: 0, divisionIds: [] });
    expect(reply).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('stays in the competition', async () => {
    const { save } = await setup();
    const other = await setup();
    expect(await save({ entryId: other.entry.id })).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('deletes a grade', async () => {
    const { entry, context } = await setup();
    await post(divisionAction, context, [
      ['intent', 'delete'],
      ['entryId', entry.id],
      ['apparatus', 'reck'],
    ]);
    expect(await prisma.grade.count()).toBe(0);
  });

  it('confirms a round and explains why not', async () => {
    const { division, context } = await setup();
    const confirm = (round: string) =>
      post(action, context, [
        ['intent', 'confirm'],
        ['ground', '1'],
        ['apparatus', 'reck'],
        ['round', round],
        ['divisionIds', division.id],
      ]);
    await confirm('2');
    expect(toasts(context)).toEqual(['error']);
    await confirm('0');
    expect(toasts(context)).toEqual(['error', 'success']);
    const progress = await prisma.divisionProgress.findMany({ where: { completedRounds: 1 } });
    expect(progress.map(({ apparatus }) => apparatus)).toEqual(['reck']);
  });
});

describe('loading', () => {
  const load = (context: any, query = '') =>
    loader({ request: new Request(`http://localhost/${query}`), context, params: {} } as any);

  it('shows the running divisions of a ground', async () => {
    const { context } = await setup();
    const data = await load(context);
    expect(data.apparatus).toHaveLength(4);
    expect(data.apparatus[0].rounds[0].slots[0]).toMatchObject({
      apparatus: 'reck',
      grade: { value: 9000 },
    });
    expect((await load(context, '?ground=2')).apparatus).toEqual([]);
  });

  it.each(['?ground=3', '?ground=0', '?ground=x', '?ground=1.5'])(
    'falls back to the first ground for %s',
    async (query) => {
      const { context } = await setup();
      expect((await load(context, query)).ground).toBe(1);
    },
  );

  it('shows one division of the contest in any state', async () => {
    const { context, division } = await setup('VIEWER', 'ENDED');
    const load = (divisionId: string) => divisionLoader({ context, params: { divisionId } } as any);
    expect(await load(division.id)).toMatchObject({ division: { id: division.id } });
    const other = await setup();
    await expect(load(other.division.id)).rejects.toMatchObject({ init: { status: 404 } });
  });
});
