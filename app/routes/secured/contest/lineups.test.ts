import { prisma } from '~/lib/prisma.server';
import { createCompetition, createDivision, createStarter, truncateTables } from '~/tests/helpers';
import { action } from '~/routes/api/competition/lineupMoves';
import { callAction, contextFor, statusOf } from '~/tests/routeContext';
import { loader } from './lineups';

beforeEach(truncateTables);

async function setup(role: 'VIEWER' | 'EDITOR' = 'EDITOR') {
  const competition = await createCompetition();
  const division = await createDivision(competition.contest.id);
  const other = await createDivision(competition.contest.id, { number: 2 });
  const entry = async (divisionId: string, lineupId?: string) =>
    (await createStarter(competition.id, { divisionId, lineupId })).entry.id;
  const reck = division.lineup('reck');
  const entries = [await entry(division.id, reck), await entry(division.id, reck)];
  const unassigned = await entry(division.id);
  const otherEntry = await entry(other.id, other.lineup('reck'));
  const context = await contextFor(competition, role);
  const params = { divisionId: division.id };
  const post = (fields: Record<string, string | string[]>) =>
    callAction(action, context, fields, params);
  const load = (divisionId = division.id) => loader({ context, params: { divisionId } } as any);
  const order = async () => (await load()).lineups[0].entries.map(({ id }) => id);
  return { competition, division, other, reck, entries, unassigned, otherEntry, post, load, order };
}

describe('loader', () => {
  it('lists lineups and unassigned starters for viewers', async () => {
    const { load, entries, unassigned } = await setup('VIEWER');
    const result = await load();
    expect(result.lineups.map(({ apparatus }) => apparatus)).toEqual([
      'reck',
      'boden',
      'schaukelringe',
      'sprung',
    ]);
    expect(result.lineups[0].entries.map(({ id }) => id)).toEqual(entries);
    expect(result.unassigned).toMatchObject([{ id: unassigned, clubName: expect.any(String) }]);
  });

  it('denies divisions of other competitions and contests', async () => {
    const { competition, load } = await setup();
    const foreign = await createDivision((await createCompetition()).contest.id);
    const { module, config } = competition.contest;
    const contest = await prisma.contest.create({
      data: { competitionId: competition.id, module, config: config as object, name: 'Final' },
    });
    const final = await createDivision(contest.id);
    for (const id of [foreign.id, final.id, 'nope']) {
      expect(await statusOf(() => load(id))).toBe(404);
    }
  });
});

describe('action', () => {
  it('is denied to viewers', async () => {
    const { post, reck, unassigned, entries, order } = await setup('VIEWER');
    const move = { intent: 'move', lineup: reck, entry: unassigned };
    expect((await post(move)).status).toBe(403);
    expect((await post({ intent: 'unassign', entry: entries })).status).toBe(403);
    expect(await order()).toEqual(entries);
  });

  it('moves to the end, before another entry and out again', async () => {
    const { post, reck, unassigned, entries, order } = await setup();
    const [first, second] = entries;
    expect((await post({ intent: 'move', lineup: reck, entry: unassigned })).status).toBe(200);
    expect(await order()).toEqual([first, second, unassigned]);
    await post({ intent: 'move', lineup: reck, entry: [unassigned, second], before: first });
    expect(await order()).toEqual([unassigned, second, first]);
    await post({ intent: 'unassign', entry: [second] });
    expect(await order()).toEqual([unassigned, first]);
  });

  it('rejects incomplete requests', async () => {
    const { post, reck } = await setup();
    expect((await post({ intent: 'move', lineup: reck })).status).toBe(400);
    expect((await post({ intent: 'nope' })).status).toBe(400);
  });

  it('denies lineups and entries of other divisions', async () => {
    const { post, other, reck, unassigned, otherEntry, entries, order } = await setup();
    const foreignCompetition = await createCompetition();
    const foreign = await createDivision(foreignCompetition.contest.id);
    const { entry } = await createStarter(foreignCompetition.id, {
      divisionId: foreign.id,
      lineupId: foreign.lineup('reck'),
    });
    const entryBefore = await prisma.entry.findMany({ orderBy: { id: 'asc' } });

    for (const lineup of [other.lineup('reck'), foreign.lineup('reck'), 'nope']) {
      const result = await post({ intent: 'move', lineup, entry: unassigned });
      expect(result).toMatchObject({ status: 404, error: 'Nicht gefunden.' });
    }
    for (const id of [otherEntry, entry.id, 'nope']) {
      const error = 'Diese Person ist nicht mehr in dieser Abteilung.';
      const move = await post({ intent: 'move', lineup: reck, entry: id });
      expect(move).toMatchObject({ status: 400, error });
      const unassign = await post({ intent: 'unassign', entry: id });
      expect(unassign).toMatchObject({ status: 400, error });
    }
    expect(await prisma.entry.findMany({ orderBy: { id: 'asc' } })).toEqual(entryBefore);
    expect(await order()).toEqual(entries);
  });

  it('does not work through another contest of the competition', async () => {
    const { competition, division, reck, unassigned, entries } = await setup();
    const { module, config } = competition.contest;
    const contest = await prisma.contest.create({
      data: { competitionId: competition.id, module, config: config as object, name: 'Final' },
    });
    const context = await contextFor({ id: competition.id, contest }, 'EDITOR');
    const params = { divisionId: division.id };
    const move = { intent: 'move', lineup: reck, entry: unassigned };
    expect(await callAction(action, context, move, params)).toMatchObject({ status: 404 });
    const unassign = { intent: 'unassign', entry: entries };
    expect(await callAction(action, context, unassign, params)).toMatchObject({ status: 404 });
    expect(await prisma.entry.count({ where: { lineupId: reck } })).toBe(2);
  });

  it('does not work through a division of another competition', async () => {
    const { competition, entries } = await setup();
    const foreign = await createDivision((await createCompetition()).contest.id);
    const context = await contextFor(competition, 'EDITOR');
    const result = await callAction(
      action,
      context,
      { intent: 'unassign', entry: entries },
      { divisionId: foreign.id },
    );
    expect(result).toMatchObject({ status: 404, error: 'Nicht gefunden.' });
  });
});
