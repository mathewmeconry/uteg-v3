import { callRoute } from '~/tests/competitionRoutes';
import {
  addMember,
  createCompetition,
  createDivision,
  createStarter,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { loader } from './dashboard';

beforeEach(truncateTables);

describe('dashboard', () => {
  it('has the counts, grounds and latest grades for a viewer', async () => {
    const competition = await createCompetition({ grounds: 2 });
    const user = await createUser();
    await addMember(competition.id, user.id, 'VIEWER');
    const division = await createDivision(competition.contest.id, { state: 'RUNNING' });
    await createStarter(competition.id, {
      divisionId: division.id,
      startApparatus: 'reck',
      grades: { reck: 9500 },
    });

    const { data } = await callRoute(loader, { userId: user.id, competitionId: competition.id });
    expect(data.stats).toMatchObject({ starters: 1, clubs: 1, grades: 1 });
    expect(data.grounds).toMatchObject([{ divisions: [{ id: division.id }] }, { divisions: [] }]);
    expect(data.latestGrades).toMatchObject([{ apparatus: 'reck', grade: '9.50' }]);
  });

  it('is hidden from strangers', async () => {
    const competition = await createCompetition();
    const { id: userId } = await createUser();
    expect((await callRoute(loader, { userId, competitionId: competition.id })).status).toBe(404);
  });
});
