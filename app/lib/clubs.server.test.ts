import { createClub as createTestClub, errorCode, truncateTables } from '~/tests/helpers';
import { createClub, listClubs } from './clubs.server';
import { prisma } from './prisma.server';

beforeEach(truncateTables);

describe('listClubs', () => {
  it('sorts by name and filters', async () => {
    await createTestClub({ name: 'TV Wil', location: 'Wil' });
    await createTestClub({ name: 'TV Bern', location: 'Bern' });
    expect((await listClubs()).map(({ name }) => name)).toEqual(['TV Bern', 'TV Wil']);
    expect((await listClubs('wil')).map(({ name }) => name)).toEqual(['TV Wil']);
  });
});

describe('createClub', () => {
  it('trims and reuses a club written differently', async () => {
    const club = await createClub({ name: ' TV Wil ', location: 'Wil' });
    expect(club.name).toBe('TV Wil');
    expect(await createClub({ name: 'tv wil', location: 'WIL' })).toEqual(club);
    expect(await createClub({ name: 'TV Wil', location: 'Bern' })).not.toEqual(club);
  });

  it('does not treat wildcards as a match', async () => {
    await createClub({ name: 'TV Wil', location: 'Wil' });
    await createClub({ name: 'TV%', location: '%' });
    expect(await prisma.club.count()).toBe(2);
  });

  it('survives being created twice at once', async () => {
    const input = { name: 'TV Wil', location: 'Wil' };
    const clubs = await Promise.all([createClub(input), createClub(input), createClub(input)]);
    expect(new Set(clubs.map(({ id }) => id)).size).toBe(1);
  });

  it('needs name and location', async () => {
    expect(await errorCode(createClub({ name: ' ', location: 'Wil' }))).toBe('INVALID_INPUT');
    expect(await errorCode(createClub({ name: 'TV', location: '' }))).toBe('INVALID_INPUT');
  });
});
