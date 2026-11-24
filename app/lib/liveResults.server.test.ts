import { createCompetition, createDivision, createStarter, truncateTables } from '~/tests/helpers';
import { updateContestConfig } from './contests.server';
import { getLatestGrades, getLiveGrounds } from './liveResults.server';
import { prisma } from './prisma.server';

beforeEach(truncateTables);

async function setGradeTime(entryId: string, apparatus: string, time: string) {
  await prisma.grade.update({
    where: { entryId_apparatus: { entryId, apparatus } },
    data: { updatedAt: new Date(time) },
  });
}

describe('getLatestGrades', () => {
  it('returns the newest grades first with name, club, apparatus and grade', async () => {
    const { id } = await createCompetition();
    const { entry, clubId } = await createStarter(id, {
      firstname: 'Anna',
      lastname: 'Ammann',
      grades: { reck: 9250, boden: 8999 },
    });
    await setGradeTime(entry.id, 'reck', '2026-05-01T10:00:00Z');
    await setGradeTime(entry.id, 'boden', '2026-05-01T11:00:00Z');
    const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });

    expect(await getLatestGrades(id, 5)).toMatchObject([
      { apparatus: 'boden', grade: '9.00' },
      {
        apparatus: 'reck',
        firstname: 'Anna',
        lastname: 'Ammann',
        clubName: club.name,
        category: 'K5',
        grade: '9.25',
      },
    ]);
    expect(await getLatestGrades(id, 1)).toHaveLength(1);
  });

  it('shows the decimals of the contest', async () => {
    const { id, contest } = await createCompetition();
    const { module, config } = contest;
    expect(module).toBe('egt');
    await updateContestConfig(id, contest.id, { ...(config as object), precision: 3 });
    await createStarter(id, { grades: { reck: 9225 } });
    expect(await getLatestGrades(id, 5)).toMatchObject([{ grade: '9.225' }]);
  });

  it('leaves out withdrawn starters and other competitions', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    await createStarter(id, { grades: { reck: 9000 }, withdrawnAt: new Date() });
    await createStarter(other.id, { grades: { reck: 9000 } });
    expect(await getLatestGrades(id, 5)).toEqual([]);
  });
});

describe('getLiveGrounds', () => {
  it('lists every ground, without running divisions an empty one', async () => {
    const { id, contest } = await createCompetition({ grounds: 2 });
    await createDivision(contest.id, { ground: 1 });
    await createDivision(contest.id, { ground: 1, number: 2, state: 'ENDED' });
    expect(await getLiveGrounds(id, 2)).toEqual([
      { ground: 1, divisions: [], apparatus: [] },
      { ground: 2, divisions: [], apparatus: [] },
    ]);
  });

  it('has the running divisions, progress and the last grade per apparatus', async () => {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const division = await createDivision(contest.id, { ground: 2, state: 'RUNNING' });
    const onReck = { divisionId: division.id, startApparatus: 'reck' };
    const first = await createStarter(id, {
      ...onReck,
      firstname: 'A',
      lastname: 'One',
      grades: { reck: 9100 },
    });
    const second = await createStarter(id, {
      ...onReck,
      firstname: 'B',
      lastname: 'Two',
      grades: { reck: 9200 },
    });
    await createStarter(id, onReck);
    await createStarter(id, { ...onReck, withdrawnAt: new Date() });
    await setGradeTime(first.entry.id, 'reck', '2026-05-01T11:00:00Z');
    await setGradeTime(second.entry.id, 'reck', '2026-05-01T10:00:00Z');
    await prisma.divisionApparatus.updateMany({
      where: { divisionId: division.id, apparatus: 'boden' },
      data: { completedRounds: 1 },
    });

    const [empty, ground] = await getLiveGrounds(id, 2);
    expect(empty.divisions).toEqual([]);
    expect(ground.divisions).toMatchObject([
      { id: division.id, category: 'K5', number: 1, round: 0, rounds: 4, percent: 6 },
    ]);
    // Women have no Barren.
    expect(ground.apparatus.map(({ apparatus }) => apparatus)).toEqual([
      'reck',
      'boden',
      'schaukelringe',
      'sprung',
    ]);
    expect(ground.apparatus[0]).toMatchObject({
      status: 'JUDGING',
      round: 1,
      rounds: 4,
      graded: 2,
      total: 3,
      latest: [
        { firstname: 'A', lastname: 'One', round: 1, grade: '9.10' },
        { firstname: 'B', lastname: 'Two', round: 1, grade: '9.20' },
      ],
    });
    expect(ground.apparatus[1]).toMatchObject({ round: 2, graded: 0, total: 3, latest: [] });
  });

  it('marks an apparatus that confirmed all rounds', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    await prisma.divisionApparatus.updateMany({
      where: { divisionId: division.id, apparatus: 'reck' },
      data: { completedRounds: 4 },
    });
    const [ground] = await getLiveGrounds(id, 1);
    expect(ground.apparatus[0]).toMatchObject({ status: 'FINISHED', round: 4, rounds: 4 });
  });
});
