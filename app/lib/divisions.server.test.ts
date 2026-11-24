import {
  createCompetition,
  createDivision as createTestDivision,
  createStarter,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import {
  createDivision,
  deleteDivisions,
  listDivisions,
  moveDivision,
  startDivisions,
  stopDivisions,
  updateDivision,
} from './divisions.server';
import { subscribe } from './events.server';
import { prisma } from './prisma.server';

const INPUT = { category: 'K5', sex: 'FEMALE', ground: 1 } as const;

beforeEach(truncateTables);

describe('createDivision', () => {
  it('numbers per category and sex, with a lineup and progress per apparatus', async () => {
    const { id, contest } = await createCompetition();
    const create = (data: object = {}) => createDivision(id, contest.id, { ...INPUT, ...data });
    const first = await create();
    expect(first).toMatchObject({ number: 1, state: 'PENDING' });
    expect((await create()).number).toBe(2);
    expect((await create({ sex: 'MALE' })).number).toBe(1);
    expect((await create({ category: 'K6' })).number).toBe(1);

    const rows = await prisma.divisionApparatus.findMany({ where: { divisionId: first.id } });
    expect(rows.map(({ apparatus }) => apparatus).sort()).toEqual([
      'boden',
      'reck',
      'schaukelringe',
      'sprung',
    ]);
  });

  it('numbers without gaps when created at the same time', async () => {
    const { id, contest } = await createCompetition();
    const divisions = await Promise.all(
      Array.from({ length: 5 }, () => createDivision(id, contest.id, INPUT)),
    );
    expect(divisions.map(({ number }) => number).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it.each([
    [{ category: 'KH' }, 'INVALID_CATEGORY'],
    [{ category: 'K8' }, 'INVALID_CATEGORY'],
    [{ ground: 2 }, 'INVALID_GROUND'],
    [{ ground: 0 }, 'INVALID_GROUND'],
  ])('rejects %j', async (data, code) => {
    const { id, contest } = await createCompetition();
    expect(await errorCode(createDivision(id, contest.id, { ...INPUT, ...data }))).toBe(code);
  });

  it('stays within the competition', async () => {
    const { id } = await createCompetition();
    const { contest } = await createCompetition();
    expect(await errorCode(createDivision(id, contest.id, INPUT))).toBe('NOT_FOUND');
  });
});

describe('listDivisions', () => {
  it('has round, progress and number of active starters', async () => {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const second = await createTestDivision(contest.id, { number: 2, state: 'RUNNING' });
    const first = await createTestDivision(contest.id, { ground: 2 });
    await createStarter(id, { divisionId: first.id });
    await createStarter(id, { divisionId: first.id, startApparatus: 'reck' });
    await createStarter(id, { divisionId: first.id, withdrawnAt: new Date() });
    await prisma.divisionApparatus.updateMany({
      where: { divisionId: second.id },
      data: { completedRounds: 2 },
    });
    await prisma.divisionApparatus.updateMany({
      where: { divisionId: second.id, apparatus: 'boden' },
      data: { completedRounds: 1 },
    });

    expect(await listDivisions(id)).toMatchObject([
      { id: first.id, number: 1, round: 0, rounds: 4, starterCount: 2, unassignedCount: 1 },
      {
        id: second.id,
        round: 1,
        progress: { reck: 2, boden: 1, schaukelringe: 2, sprung: 2 },
        starterCount: 0,
      },
    ]);
    const list = async (filter: object) => (await listDivisions(id, filter)).map((d) => d.id);
    expect(await list({ state: 'RUNNING' })).toEqual([second.id]);
    expect(await list({ ground: 2 })).toEqual([first.id]);
    expect(await list({ ids: [second.id] })).toEqual([second.id]);
    expect(await list({ contestId: 'nope' })).toEqual([]);
    expect(await listDivisions((await createCompetition()).id)).toEqual([]);
  });
});

describe('updateDivision', () => {
  it('changes the ground', async () => {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const division = await createTestDivision(contest.id);
    await updateDivision(id, division.id, { ground: 2 });
    expect(await listDivisions(id)).toMatchObject([{ ground: 2 }]);
    expect(await errorCode(updateDivision(id, division.id, { ground: 3 }))).toBe('INVALID_GROUND');
    const other = await createCompetition({ grounds: 2 });
    const foreign = updateDivision(other.id, division.id, { ground: 1 });
    expect(await errorCode(foreign)).toBe('NOT_FOUND');
  });

  it('is due last on another ground and keeps its place on the same', async () => {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const create = (ground: number) => createDivision(id, contest.id, { ...INPUT, ground });
    const [first, second] = [await create(1), await create(1)];
    expect([first.position, second.position, (await create(2)).position]).toEqual([1, 2, 1]);
    await updateDivision(id, first.id, { ground: 1 });
    expect(await listDivisions(id, { ids: [first.id] })).toMatchObject([{ position: 1 }]);
    await updateDivision(id, first.id, { ground: 2 });
    expect(await listDivisions(id, { ids: [first.id] })).toMatchObject([{ position: 2 }]);
  });
});

describe('moveDivision', () => {
  async function setup() {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const create = (ground: number) => createDivision(id, contest.id, { ...INPUT, ground });
    const divisions = [await create(1), await create(1), await create(1), await create(2)];
    const [a, b, c, x] = divisions.map((division) => division.id);
    const names = new Map([a, b, c, x].map((divisionId, index) => [divisionId, 'abcx'[index]]));
    const order = async (ground: number) =>
      (await prisma.division.findMany({ where: { ground }, orderBy: { position: 'asc' } }))
        .map((division) => names.get(division.id))
        .join('');
    return { id, a, b, c, x, order };
  }

  it('moves within a ground and to another one', async () => {
    const { id, a, c, x, order } = await setup();
    await moveDivision(id, c, { ground: 1, beforeId: a });
    expect(await order(1)).toBe('cab');
    await moveDivision(id, c, { ground: 1 });
    expect(await order(1)).toBe('abc');
    await moveDivision(id, a, { ground: 2, beforeId: x });
    expect([await order(1), await order(2)]).toEqual(['bc', 'ax']);
  });

  it('goes to the end when the one after it left the ground', async () => {
    const { id, a, x, order } = await setup();
    await moveDivision(id, a, { ground: 1, beforeId: x });
    expect(await order(1)).toBe('bca');
  });

  it('keeps the place of one that was started and stopped', async () => {
    const { id, a, b, c, order } = await setup();
    await startDivisions(id, [b]);
    await moveDivision(id, c, { ground: 1, beforeId: a });
    await stopDivisions(id, [b]);
    expect(await order(1)).toBe('cab');
  });

  it('only moves planned divisions of the competition to one of its grounds', async () => {
    const { id, a } = await setup();
    expect(await errorCode(moveDivision(id, a, { ground: 3 }))).toBe('INVALID_GROUND');
    const other = await createCompetition({ grounds: 2 });
    expect(await errorCode(moveDivision(other.id, a, { ground: 1 }))).toBe('NOT_FOUND');
    await startDivisions(id, [a]);
    expect(await errorCode(moveDivision(id, a, { ground: 2 }))).toBe('DIVISION_NOT_PENDING');
  });
});

describe('deleteDivisions', () => {
  it('closes several gaps', async () => {
    const { id, contest } = await createCompetition();
    const list = [];
    for (const number of [1, 2, 3, 4, 5]) {
      list.push(await createTestDivision(contest.id, { number }));
    }
    await deleteDivisions(id, [list[0].id, list[3].id]);
    const rest = await listDivisions(id);
    expect(rest.map((division) => [division.id, division.number])).toEqual([
      [list[1].id, 1],
      [list[2].id, 2],
      [list[4].id, 3],
    ]);
  });

  it('renumbers the others and unassigns the starters', async () => {
    const { id, contest } = await createCompetition();
    const [first, second, third] = await Promise.all(
      [1, 2, 3].map((number) => createTestDivision(contest.id, { number })),
    );
    const men = await createTestDivision(contest.id, { sex: 'MALE', number: 2 });
    const starter = await createStarter(id, {
      divisionId: first.id,
      startApparatus: 'reck',
      grades: { reck: 9000 },
    });
    await deleteDivisions(id, [first.id]);

    const numbers = Object.fromEntries((await listDivisions(id)).map((d) => [d.id, d.number]));
    expect(numbers).toEqual({ [second.id]: 1, [third.id]: 2, [men.id]: 2 });
    expect(await prisma.entry.findUnique({ where: { id: starter.entry.id } })).toMatchObject({
      divisionId: null,
      startApparatus: null,
    });
    expect(await prisma.grade.count()).toBe(1);
  });

  it('does not delete a running division or one of another competition', async () => {
    const { id, contest } = await createCompetition();
    const division = await createTestDivision(contest.id, { state: 'RUNNING' });
    const pending = await createTestDivision(contest.id, { number: 2 });
    const both = deleteDivisions(id, [pending.id, division.id]);
    expect(await errorCode(both)).toBe('DIVISION_RUNNING');
    expect(await prisma.division.count()).toBe(2);
    const other = await createCompetition();
    expect(await errorCode(deleteDivisions(other.id, [pending.id]))).toBe('NOT_FOUND');
  });
});

describe('startDivisions', () => {
  it('starts pending divisions, resets progress and keeps grades', async () => {
    const { id, contest } = await createCompetition();
    const division = await createTestDivision(contest.id);
    await createStarter(id, { divisionId: division.id, grades: { reck: 9000 } });
    await prisma.divisionApparatus.updateMany({ data: { completedRounds: 3 } });
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    await startDivisions(id, [division.id]);
    stop();

    expect(await listDivisions(id)).toMatchObject([
      { state: 'RUNNING', round: 0, startedAt: expect.any(Date), endedAt: null },
    ]);
    expect(await prisma.grade.count()).toBe(1);
    expect(listener).toHaveBeenCalledWith('divisions');
  });

  it('restarts an ended division only when told to', async () => {
    const { id, contest } = await createCompetition();
    const division = await createTestDivision(contest.id, { state: 'ENDED' });
    expect(await errorCode(startDivisions(id, [division.id]))).toBe('RESTART_NOT_CONFIRMED');
    await startDivisions(id, [division.id], { restart: true });
    expect(await listDivisions(id)).toMatchObject([{ state: 'RUNNING', round: 0, endedAt: null }]);
  });

  it('starts all or none', async () => {
    const { id, contest } = await createCompetition();
    const pending = await createTestDivision(contest.id);
    const running = await createTestDivision(contest.id, { number: 2, state: 'RUNNING' });
    const start = startDivisions(id, [pending.id, running.id]);
    expect(await errorCode(start)).toBe('DIVISION_RUNNING');
    const foreign = await createCompetition();
    const other = await createTestDivision(foreign.contest.id);
    expect(await errorCode(startDivisions(id, [pending.id, other.id]))).toBe('NOT_FOUND');
    expect(await listDivisions(id, { state: 'PENDING' })).toHaveLength(1);
  });
});

describe('stopDivisions', () => {
  it('stops only running divisions', async () => {
    const { id, contest } = await createCompetition();
    const running = await createTestDivision(contest.id, { state: 'RUNNING' });
    const ended = await createTestDivision(contest.id, { number: 2, state: 'ENDED' });
    const both = stopDivisions(id, [running.id, ended.id]);
    expect(await errorCode(both)).toBe('DIVISION_NOT_RUNNING');
    await stopDivisions(id, [running.id]);
    expect(await listDivisions(id, { state: 'PENDING' })).toMatchObject([{ id: running.id }]);
  });
});
