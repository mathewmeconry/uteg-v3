import { prisma } from '~/lib/prisma.server';
import {
  createClub,
  createCompetition,
  createDivision,
  createStarter,
  truncateTables,
} from '~/tests/helpers';
import { callAction, contextFor } from '~/tests/routeContext';
import { action, loader } from './divisionProposal';

beforeEach(truncateTables);

async function setup(role: 'VIEWER' | 'EDITOR' = 'EDITOR') {
  const competition = await createCompetition({ grounds: 2 });
  const context = await contextFor(competition, role);
  const { id: clubId } = await createClub();
  const entries: string[] = [];
  for (let index = 0; index < 3; index++) {
    await createStarter(competition.id, { clubId, lastname: `Name${index}` });
    const entry = await prisma.entry.findFirstOrThrow({ where: { id: { notIn: entries } } });
    entries.push(entry.id);
  }
  const postGroups = (groups: unknown) =>
    callAction(action, context, { groups: JSON.stringify(groups) });
  const post = (divisions: unknown, fields: object = {}) =>
    postGroups([{ category: 'K5', sex: 'FEMALE', ground: 2, divisions, ...fields }]);
  return { competition, context, entries, post, postGroups };
}

async function expectNothingCreated() {
  expect(await prisma.division.count()).toBe(0);
  expect(await prisma.entry.count({ where: { divisionId: { not: null } } })).toBe(0);
}

describe('loader', () => {
  it('has who is in no division, in order', async () => {
    const { competition, context, entries } = await setup();
    const division = await createDivision(competition.contest.id);
    await createStarter(competition.id, { divisionId: division.id });
    await createStarter(competition.id, { withdrawnAt: new Date() });
    await createStarter(competition.id, { category: null });
    const result = await loader({ context } as any);
    expect(result.entries.map(({ id }) => id)).toEqual(entries);
  });

  it('has what is already due per ground and the numbers in use', async () => {
    const { competition, context } = await setup();
    await createDivision(competition.contest.id, { ground: 2, number: 1, state: 'ENDED' });
    await createDivision(competition.contest.id, { ground: 2, number: 2 });
    const result = await loader({ context } as any);
    expect(result).toMatchObject({ due: [0, 1], numbers: { 'K5 FEMALE': 2 } });
  });

  it('is denied to viewers', async () => {
    const { context } = await setup('VIEWER');
    await expect(async () => loader({ context } as any)).rejects.toMatchObject({
      init: { status: 403 },
    });
  });
});

describe('action', () => {
  it('creates the divisions with their lineups in this order', async () => {
    const { competition, entries, post } = await setup();
    await createDivision(competition.contest.id);
    const [a, b, c] = entries;
    const { toasts } = await post([{ boden: [b, a], reck: [] }, { sprung: [c] }]);
    expect(toasts).toMatchObject([{ type: 'success', message: '2 Abteilungen erstellt' }]);

    const divisions = await prisma.division.findMany({
      where: { number: { gt: 1 } },
      orderBy: { number: 'asc' },
      include: { apparatus: true, entries: { orderBy: { position: 'asc' } } },
    });
    expect(divisions).toMatchObject([
      { number: 2, ground: 2, position: 1, state: 'PENDING' },
      { number: 3, ground: 2, position: 2, state: 'PENDING' },
    ]);
    expect(divisions.map(({ apparatus }) => apparatus.length)).toEqual([4, 4]);
    const lineups = divisions.map(({ entries }) =>
      entries.map(({ id, startApparatus }) => [id, startApparatus]),
    );
    expect(lineups).toEqual([
      [
        [b, 'boden'],
        [a, 'boden'],
      ],
      [[c, 'sprung']],
    ]);
  });

  it('creates several categories, or none when one of them is outdated', async () => {
    const { competition, entries, postGroups } = await setup();
    await createStarter(competition.id, { category: 'K6' });
    const k6 = await prisma.entry.findFirstOrThrow({ where: { category: 'K6' } });
    const groups = (id: string) => [
      { category: 'K5', sex: 'FEMALE', ground: 1, divisions: [{ boden: entries }] },
      { category: 'K6', sex: 'FEMALE', ground: 2, divisions: [{ reck: [id] }] },
    ];
    expect((await postGroups(groups('unknown'))).status).toBe(400);
    await expectNothingCreated();

    await postGroups(groups(k6.id));
    expect(await prisma.division.findMany({ orderBy: { ground: 'asc' } })).toMatchObject([
      { category: 'K5', ground: 1, number: 1 },
      { category: 'K6', ground: 2, number: 1 },
    ]);
    expect(await prisma.entry.count({ where: { divisionId: null } })).toBe(0);
  });

  it('is denied to viewers', async () => {
    const { entries, post } = await setup('VIEWER');
    expect((await post([{ boden: entries }])).status).toBe(403);
    await expectNothingCreated();
  });

  it.each([
    ['withdrawn', { withdrawnAt: new Date() }],
    ['in another category', { category: 'K6' }],
  ])('creates nothing when somebody is %s by now', async (_, change) => {
    const { entries, post } = await setup();
    await prisma.entry.update({ where: { id: entries[2] }, data: change });
    expect((await post([{ boden: entries }])).status).toBe(400);
    await expectNothingCreated();
  });

  it('creates nothing when somebody has a division by now', async () => {
    const { competition, entries, post } = await setup();
    const { id: divisionId } = await createDivision(competition.contest.id);
    await prisma.entry.update({ where: { id: entries[0] }, data: { divisionId } });
    expect((await post([{ boden: entries }])).status).toBe(400);
    expect(await prisma.division.count()).toBe(1);
    expect(await prisma.entry.count({ where: { divisionId } })).toBe(1);
  });

  it('rejects starters of another competition, duplicates and wrong values', async () => {
    const { context, entries, post, postGroups } = await setup();
    const other = await createCompetition();
    await createStarter(other.id);
    const foreign = await prisma.entry.findFirstOrThrow({ where: { contestId: other.contest.id } });
    const results = [
      await post([{ boden: [foreign.id] }]),
      await post([{ boden: [entries[0], entries[0]] }]),
      await post([{ barren: entries }]),
      await post([]),
      await post([{ boden: entries }], { ground: 3 }),
      await post([{ boden: entries }], { sex: 'MALE' }),
      await postGroups([]),
      await callAction(action, context, { groups: '{' }),
    ];
    expect(results.map(({ status }) => status)).toEqual(results.map(() => 400));
    await expectNothingCreated();
  });
});
