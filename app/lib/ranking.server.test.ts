import { egtModule } from '~/modules/egt/module';
import {
  createCompetition,
  createDivision,
  createStarter,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import { prisma } from './prisma.server';
import { getRanking, listCategoryStates } from './ranking.server';

const K5 = { category: 'K5', sex: 'FEMALE' } as const;

beforeEach(truncateTables);

type Division = Awaited<ReturnType<typeof createDivision>>;

function add(competitionId: string, division: Division, firstname: string, data: object = {}) {
  return createStarter(competitionId, {
    firstname,
    sex: division.sex,
    category: division.category,
    divisionId: division.id,
    startApparatus: 'reck',
    ...data,
  });
}

const names = (ranking: Awaited<ReturnType<typeof getRanking>>) =>
  ranking.entries.map(({ firstname }) => firstname);

describe('listCategoryStates', () => {
  it('tells how far each category is', async () => {
    const { id, contest } = await createCompetition();
    const add = (category: string, ...states: ('PENDING' | 'RUNNING' | 'ENDED')[]) =>
      Promise.all(
        states.map((state, index) =>
          createDivision(contest.id, { category, number: index + 1, state }),
        ),
      );
    await add('K1', 'ENDED', 'ENDED');
    await add('K2', 'ENDED', 'PENDING', 'RUNNING');
    await add('K3', 'ENDED', 'PENDING');
    await add('K4', 'PENDING');
    await createDivision(contest.id, { category: 'K1', sex: 'MALE', state: 'RUNNING' });
    const states = await listCategoryStates(id, contest.id);
    expect(states).toContainEqual({ sex: 'FEMALE', category: 'K5', state: null });
    const begun = states.filter(({ state }) => state);
    expect(begun.map(({ sex, category, state }) => `${sex} ${category} ${state}`)).toEqual([
      'FEMALE K1 ENDED',
      'FEMALE K2 RUNNING',
      'FEMALE K3 PARTLY',
      'FEMALE K4 PENDING',
      'MALE K1 RUNNING',
    ]);
  });
});

describe('getRanking', () => {
  it('ranks the ended divisions of a category and sex', async () => {
    const { id, contest } = await createCompetition();
    const one = await createDivision(contest.id, { state: 'ENDED' });
    const two = await createDivision(contest.id, { number: 2, state: 'ENDED' });
    const men = await createDivision(contest.id, { sex: 'MALE', state: 'ENDED' });
    const k6 = await createDivision(contest.id, { category: 'K6', state: 'ENDED' });
    await add(id, one, 'A', { grades: { reck: 9000, boden: 8000, barren: 9000 } });
    await add(id, two, 'B', { grades: { reck: 9500, boden: 9500 } });
    await add(id, men, 'M', { grades: { reck: 9900 } });
    await add(id, k6, 'K6', { grades: { reck: 9900 } });

    const ranking = await getRanking(id, contest.id, K5);
    expect(ranking.entries).toMatchObject([
      { firstname: 'B', rank: 1, total: 19000, award: 'GOLD', clubName: expect.any(String) },
      { firstname: 'A', rank: 2, total: 17000, award: 'SILVER' },
    ]);
    expect(ranking.best).toEqual({ reck: 9500, boden: 9500, schaukelringe: null, sprung: null });
    expect(ranking.hasRunning).toBe(false);
    expect(ranking.apparatus).toEqual(['reck', 'boden', 'schaukelringe', 'sprung']);
    const men5 = await getRanking(id, contest.id, { category: 'K5', sex: 'MALE' });
    expect(men5.apparatus).toHaveLength(5);
  });

  it('leaves out withdrawn entries and entries without a lineup', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'ENDED' });
    await add(id, division, 'A');
    await add(id, division, 'withdrawn', { withdrawnAt: new Date() });
    await add(id, division, 'no lineup', { startApparatus: undefined });
    expect(names(await getRanking(id, contest.id, K5))).toEqual(['A']);
  });

  it('adds running divisions only when asked for', async () => {
    const { id, contest } = await createCompetition();
    const ended = await createDivision(contest.id, { state: 'ENDED' });
    const running = await createDivision(contest.id, { number: 2, state: 'RUNNING' });
    const pending = await createDivision(contest.id, { number: 3 });
    await add(id, ended, 'ended', { grades: { reck: 9000 } });
    await add(id, running, 'running', { grades: { reck: 9500 } });
    await add(id, pending, 'pending', { grades: { reck: 9900 } });

    const ranking = await getRanking(id, contest.id, K5);
    expect(names(ranking)).toEqual(['ended']);
    expect(ranking.hasRunning).toBe(true);
    const provisional = await getRanking(id, contest.id, { ...K5, provisional: true });
    expect(names(provisional)).toEqual(['running', 'ended']);
  });

  it('only warns about running divisions of the same category and sex', async () => {
    const { id, contest } = await createCompetition();
    await createDivision(contest.id, { category: 'K6', state: 'RUNNING' });
    await createDivision(contest.id, { sex: 'MALE', state: 'RUNNING' });
    expect((await getRanking(id, contest.id, K5)).hasRunning).toBe(false);
  });

  it('counts the missing grades of the ranked entries', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'ENDED' });
    const all = { reck: 0, boden: 9000, schaukelringe: 9000, sprung: 9000 };
    await add(id, division, 'A', { grades: all });
    expect((await getRanking(id, contest.id, K5)).missingGrades).toBe(0);
    await add(id, division, 'B', { grades: { reck: 9000, barren: 9000 } });
    await add(id, division, 'withdrawn', { withdrawnAt: new Date() });
    expect((await getRanking(id, contest.id, K5)).missingGrades).toBe(3);
  });

  it('knows the last change', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'ENDED' });
    expect((await getRanking(id, contest.id, K5)).lastUpdated).toBeNull();
    await add(id, division, 'A', { grades: { reck: 9000, boden: 9000 } });
    const lastUpdated = new Date('2030-01-01T10:00:00Z');
    await prisma.$executeRaw`UPDATE grade SET "updatedAt" = ${lastUpdated} WHERE apparatus = 'reck'`;
    expect((await getRanking(id, contest.id, K5)).lastUpdated).toEqual(lastUpdated);
  });

  it('uses the settings of the contest', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'ENDED' });
    await add(id, division, 'A', { grades: { reck: 9225 } });
    await prisma.contest.update({
      where: { id: contest.id },
      data: { config: { ...egtModule.defaultConfig, precision: 3 } },
    });
    const ranking = await getRanking(id, contest.id, K5);
    expect(ranking.entries[0].total).toBe(9225);
    expect(ranking.options.precision).toBe(3);
  });

  it('rejects unknown categories and other competitions', async () => {
    const { id, contest } = await createCompetition();
    const other = await createCompetition();
    const unknown = getRanking(id, contest.id, { category: 'KH', sex: 'FEMALE' });
    expect(await errorCode(unknown)).toBe('INVALID_CATEGORY');
    expect(await errorCode(getRanking(other.id, contest.id, K5))).toBe('NOT_FOUND');
  });
});
