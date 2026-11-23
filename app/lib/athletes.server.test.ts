import { createClub, createCompetition, createStarter, truncateTables } from '~/tests/helpers';
import { suggestAthletes } from './athletes.server';
import { prisma } from './prisma.server';

// Matching and changing athletes is tested through starters.server.

beforeEach(truncateTables);

describe('suggestAthletes', () => {
  it('finds athletes of all competitions by name and STV-ID', async () => {
    const one = await createCompetition();
    const two = await createCompetition();
    await createStarter(one.id, { firstname: 'Anna', lastname: 'Muster', stvId: '12345' });
    await createStarter(two.id, { firstname: 'Bea', lastname: 'Annen' });
    await createStarter(two.id, { firstname: 'Carla', lastname: 'Other' });

    const find = async (query: string) =>
      (await suggestAthletes(query)).map(({ firstname }) => firstname);
    expect(await find('ann')).toEqual(['Bea', 'Anna']);
    expect(await find('muster an')).toEqual(['Anna']);
    expect(await find('Anna Muster')).toEqual(['Anna']);
    expect(await find('123')).toEqual(['Anna']);
    expect(await find('xyz')).toEqual([]);
  });

  it.each(['', 'a', ' a '])('needs two characters, not "%s"', async (query) => {
    await createStarter((await createCompetition()).id, { firstname: 'Anna' });
    expect(await suggestAthletes(query)).toEqual([]);
  });

  it('returns each athlete once, with master data and the latest club', async () => {
    const one = await createCompetition();
    const two = await createCompetition();
    const oldClub = await createClub({ name: 'Old' });
    const newClub = await createClub({ name: 'New' });
    const { athleteId } = await createStarter(one.id, {
      firstname: 'Anna',
      lastname: 'Muster',
      birthYear: 2010,
      stvId: '1',
      clubId: oldClub.id,
    });
    await createStarter(two.id, { athleteId, firstname: 'Änni', clubId: newClub.id });

    expect(await suggestAthletes('anna')).toEqual([
      {
        athleteId,
        stvId: '1',
        firstname: 'Anna',
        lastname: 'Muster',
        birthYear: 2010,
        sex: 'FEMALE',
        club: newClub,
      },
    ]);
    // Values of single competitions are not searched.
    expect(await suggestAthletes('Änni')).toEqual([]);
  });

  it('still finds athletes whose competition was deleted', async () => {
    const { id } = await createCompetition();
    await createStarter(id, { firstname: 'Anna' });
    await prisma.competition.delete({ where: { id } });
    expect(await suggestAthletes('anna')).toMatchObject([{ firstname: 'Anna', club: null }]);
  });

  it('limits the results', async () => {
    const { id } = await createCompetition();
    for (let i = 0; i < 12; i++) await createStarter(id, { firstname: 'Anna' });
    expect(await suggestAthletes('anna')).toHaveLength(10);
  });
});
