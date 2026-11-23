import { beforeEach, describe, expect, it } from 'vitest';
import { getContest } from '~/lib/contests.server';
import { createCompetition, createDivision, createStarter, truncateTables } from '~/tests/helpers';
import { callRoute } from '~/tests/routes';
import { action, loader } from './ranking';

beforeEach(truncateTables);

async function setup() {
  const { id, contest } = await createCompetition();
  const ended = await createDivision(contest.id, { state: 'ENDED' });
  const running = await createDivision(contest.id, { number: 2, state: 'RUNNING' });
  const men = await createDivision(contest.id, { sex: 'MALE', category: 'K6', state: 'RUNNING' });
  const add = (division: typeof ended, firstname: string, value: number) =>
    createStarter(id, {
      firstname,
      sex: division.sex,
      category: division.category,
      divisionId: division.id,
      lineupId: division.lineup('reck'),
      grades: { reck: value },
    });
  await add(ended, 'Anna', 9000);
  await add(running, 'Bea', 9500);
  await add(men, 'Noah', 9900);

  const load = (search = '', role: 'VIEWER' | undefined = 'VIEWER') =>
    callRoute(loader, { competitionId: id, contestId: contest.id, role, search });
  const names = async (search = '') =>
    (await load(search)).ranking.entries.map(({ firstname }: { firstname: string }) => firstname);
  return { id, contest, load, names };
}

describe('loader', () => {
  it('shows the first category with results unless one is chosen', async () => {
    const { load, names } = await setup();
    expect(await load()).toMatchObject({ sex: 'FEMALE', category: 'K5', provisional: false });
    expect(await names()).toEqual(['Anna']);
    expect(await load('?sex=MALE')).toMatchObject({ sex: 'MALE', category: 'K6' });
    expect(await load('?sex=MALE&category=KH')).toMatchObject({ category: 'KH' });
    expect((await load('?sex=MALE&category=KD')).category).toBe('K6');
    expect((await load('?sex=x&category=y')).category).toBe('K5');
  });

  it('warns about running divisions and includes them on request', async () => {
    const { load, names } = await setup();
    expect((await load()).ranking.hasRunning).toBe(true);
    expect(await names('?provisional=1')).toEqual(['Bea', 'Anna']);
    expect((await load()).groups).toMatchObject([{ sex: 'FEMALE', category: 'K5' }]);
    expect((await load('?provisional=1')).groups).toHaveLength(2);
  });

  it('works without any division', async () => {
    const { id, contest } = await createCompetition();
    const result = await callRoute(loader, {
      competitionId: id,
      contestId: contest.id,
      role: 'VIEWER',
    });
    expect(result).toMatchObject({ sex: 'FEMALE', category: 'K1', groups: [] });
  });

  it('is hidden from strangers', async () => {
    const { id, contest } = await setup();
    const response = await callRoute(loader, { competitionId: id, contestId: contest.id });
    expect(response.status).toBe(404);
  });
});

describe('honour percentage', () => {
  async function post(
    fields: Record<string, string>,
    role: 'VIEWER' | 'EDITOR' | undefined = 'EDITOR',
  ) {
    const { id, contest } = await createCompetition();
    const result = await callRoute(action, {
      competitionId: id,
      contestId: contest.id,
      role,
      search: '?sex=FEMALE&category=K5',
      form: Object.entries({ sex: 'FEMALE', category: 'K5', ...fields }),
    });
    const { module } = await getContest(id, contest.id);
    const percent = (category: string) => module.rankingOptions(category, 'FEMALE').honourPercent;
    return { result, k5: percent('K5'), k6: percent('K6') };
  }

  it('is saved for one category', async () => {
    const { result, k5, k6 } = await post({ percent: '40,5' });
    expect(result).toEqual({ errors: undefined });
    expect(k5).toBe(40.5);
    expect(k6).toBe(33);
  });

  it.each(['', '101', '-1', 'x', '1e1'])('rejects %j', async (percent) => {
    const { result, k5 } = await post({ percent });
    expect(result.init.status).toBe(400);
    expect(result.data.errors.percent).toBe('Zahl von 0 bis 100');
    expect(k5).toBe(33);
  });

  it('keeps other categories that are changed at the same time', async () => {
    const { id, contest } = await createCompetition();
    const categories = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'];
    await Promise.all(
      categories.map((category) =>
        callRoute(action, {
          competitionId: id,
          contestId: contest.id,
          role: 'EDITOR',
          form: Object.entries({ sex: 'FEMALE', category, percent: '77' }),
        }),
      ),
    );
    const { module } = await getContest(id, contest.id);
    expect(categories.map((item) => module.rankingOptions(item, 'FEMALE').honourPercent)).toEqual(
      categories.map(() => 77),
    );
  });

  it('can only be changed by editors and for categories of the sex', async () => {
    expect((await post({ percent: '40' }, 'VIEWER')).result.status).toBe(403);
    expect((await post({ percent: '40', category: 'KH' })).result.status).toBe(404);
  });
});
