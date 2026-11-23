import { prisma } from '~/lib/prisma.server';
import { assertTestDatabase } from './database';
import { createCompetition, truncateTables } from './helpers';

describe('truncateTables', () => {
  it('empties the test database', async () => {
    await createCompetition();
    await truncateTables();
    expect(await prisma.competition.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it.each(['uteg', 'postgres', 'my_uteg_test', 'uteg_test"; DROP'])('refuses %s', (name) => {
    expect(() => assertTestDatabase(name)).toThrow(/not a test database/);
  });

  it.each(['uteg_test', 'uteg_test_domain'])('accepts %s', (name) => {
    expect(() => assertTestDatabase(name)).not.toThrow();
  });
});
