import { createDisplay, getOrCreateJudgeLinks, resetToken } from '~/lib/access.server';
import { prisma } from '~/lib/prisma.server';
import { createCompetition, createDivision, createStarter, truncateTables } from '~/tests/helpers';
import { action } from './api/judgeGrades';
import { loader as displayLoader } from './display';
import { loader } from './judge';

beforeEach(truncateTables);

async function setup(state: 'PENDING' | 'RUNNING' | 'ENDED' = 'RUNNING') {
  const competition = await createCompetition({ grounds: 2 });
  const division = await createDivision(competition.contest.id, { state });
  const { entry } = await createStarter(competition.id, {
    divisionId: division.id,
    lineupId: division.lineup('reck'),
  });
  const links = await getOrCreateJudgeLinks(competition.id);
  const link = (apparatus: string, ground = 1) =>
    links.find((item) => item.apparatus === apparatus && item.ground === ground)!;
  return { ...competition, division, entry, link };
}

async function post(token: string, body: unknown) {
  const request = new Request('http://localhost/api/judge/x/grades', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const args = { request, params: { token } } as any;
  const response = await action(args).catch((error: Response) => error);
  return response.status === 404 ? 404 : response.json();
}

const save = (entryId: string, patch: object = {}) => ({
  intent: 'save',
  entryId,
  apparatus: 'reck',
  grade: { value: 9100, attempts: [] },
  previous: null,
  ...patch,
});

describe('saving a grade', () => {
  it('saves and tells when', async () => {
    const { entry, link } = await setup();
    const before = Date.now();
    const reply = await post(link('reck').token, save(entry.id));
    expect(reply.ok).toBe(true);
    expect(reply.savedAt).toBeGreaterThanOrEqual(before);
    expect(await prisma.grade.findFirst()).toMatchObject({ apparatus: 'reck', value: 9100 });
  });

  it('stays on the own apparatus and ground', async () => {
    const { entry, link } = await setup();
    const refused = { ok: false, code: 'ENTRY_NOT_JUDGEABLE' };
    expect(await post(link('reck', 2).token, save(entry.id))).toEqual(refused);
    expect(await post(link('boden').token, save(entry.id))).toEqual(refused);
    expect(await post(link('reck').token, save(entry.id, { apparatus: 'boden' }))).toEqual(refused);
    expect(await prisma.grade.count()).toBe(0);
  });

  it.each(['PENDING', 'ENDED'] as const)('refuses a division that is %s', async (state) => {
    const { entry, link } = await setup(state);
    const reply = await post(link('reck').token, save(entry.id));
    expect(reply).toEqual({ ok: false, code: 'ENTRY_NOT_JUDGEABLE' });
  });

  it('refuses withdrawn starters and those of other competitions', async () => {
    const { entry, link } = await setup();
    const other = await setup();
    const foreign = await post(link('reck').token, save(other.entry.id));
    expect(foreign).toEqual({ ok: false, code: 'NOT_FOUND' });
    await prisma.entry.update({ where: { id: entry.id }, data: { withdrawnAt: new Date() } });
    const withdrawn = await post(link('reck').token, save(entry.id));
    expect(withdrawn).toEqual({ ok: false, code: 'ENTRY_WITHDRAWN' });
  });

  it.each([
    [{ grade: { value: 10001, attempts: [] } }, 'INVALID_GRADE'],
    [{ grade: { value: -1, attempts: [] } }, 'INVALID_GRADE'],
    [{ grade: { value: 9.5, attempts: [] } }, 'INVALID_GRADE'],
    [{ grade: { value: 9000, attempts: [9000, 9000] } }, 'INVALID_GRADE'],
    [{ grade: { value: '9000', attempts: [] } }, 'INVALID_INPUT'],
    [{ grade: undefined }, 'INVALID_INPUT'],
    [{ previous: undefined }, 'INVALID_INPUT'],
    [{ intent: 'other' }, 'INVALID_INPUT'],
  ])('refuses %j', async (patch, code) => {
    const { entry, link } = await setup();
    expect(await post(link('reck').token, save(entry.id, patch))).toEqual({ ok: false, code });
    expect(await prisma.grade.count()).toBe(0);
  });

  it('refuses something that is no request', async () => {
    const { link } = await setup();
    const reply = await post(link('reck').token, 'nonsense');
    expect(reply).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('does not overwrite a grade the judge has not seen', async () => {
    const { entry, link } = await setup();
    await prisma.grade.create({ data: { entryId: entry.id, apparatus: 'reck', value: 9500 } });
    const reply = await post(link('reck').token, save(entry.id));
    expect(reply).toEqual({ ok: false, code: 'GRADE_CHANGED' });
  });

  it('needs a valid judge link', async () => {
    const { id, entry, link } = await setup();
    const display = await createDisplay(id, 1);
    const { token } = link('reck');
    expect(await post('unknown', save(entry.id))).toBe(404);
    expect(await post(display.token, save(entry.id))).toBe(404);
    await resetToken(id, link('reck').id);
    expect(await post(token, save(entry.id))).toBe(404);
    expect(await prisma.grade.count()).toBe(0);
  });
});

describe('confirming a round', () => {
  it('only confirms the own apparatus', async () => {
    const { division, entry, link } = await setup();
    const confirm = (apparatus: string, round = 0, ground = 1) =>
      post(link(apparatus, ground).token, {
        intent: 'confirm',
        round,
        divisionIds: [division.id],
      });
    expect(await confirm('reck')).toEqual({ ok: false, code: 'GRADES_MISSING' });
    expect(await confirm('reck', 0, 2)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await confirm('barren')).toEqual({ ok: false, code: 'INVALID_APPARATUS' });
    await post(link('reck').token, save(entry.id));
    expect(await confirm('reck')).toMatchObject({ ok: true });
    expect(await confirm('reck')).toMatchObject({ ok: true });
    expect(await confirm('reck', 2)).toEqual({ ok: false, code: 'ROUND_NOT_CURRENT' });
    const progress = await prisma.divisionProgress.findMany({ where: { completedRounds: 1 } });
    expect(progress.map(({ apparatus }) => apparatus)).toEqual(['reck']);
  });
});

describe('loading the pages', () => {
  it('gives a judge only the own apparatus', async () => {
    const { entry, link, id } = await setup();
    const { token } = link('reck');
    const data = await loader({ params: { token } } as any);
    expect(data).toMatchObject({
      ground: 1,
      competitionName: 'Gerätecup',
      tablet: { apparatus: 'reck', status: 'JUDGING', currentRound: 0 },
    });
    expect(data.tablet.rounds[0].slots).toMatchObject([{ entryId: entry.id, apparatus: 'reck' }]);
    const text = JSON.stringify(data);
    const links = await prisma.accessLink.findMany({ where: { competitionId: id } });
    for (const other of links) expect(text).not.toContain(other.token);
  });

  it('shows a display the grades of its ground', async () => {
    const { id } = await setup();
    const one = await createDisplay(id, 1);
    const two = await createDisplay(id, 2);
    const data = await displayLoader({ params: { token: one.token } } as any);
    expect(data.apparatus.map(({ apparatus }) => apparatus)).toHaveLength(4);
    expect(JSON.stringify(data)).not.toContain(one.token);
    const other = await displayLoader({ params: { token: two.token } } as any);
    expect(other.apparatus).toEqual([]);
  });

  it('refuses unknown links and the wrong kind', async () => {
    const { id, link } = await setup();
    const display = await createDisplay(id, 1);
    for (const run of [
      () => loader({ params: { token: 'unknown' } } as any),
      () => loader({ params: { token: display.token } } as any),
      () => displayLoader({ params: { token: link('reck').token } } as any),
    ]) {
      await expect(run()).rejects.toMatchObject({ init: { status: 404 } });
    }
  });
});
