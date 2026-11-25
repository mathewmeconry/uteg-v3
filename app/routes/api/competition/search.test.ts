import { beforeEach, expect, it } from 'vitest';
import { prisma } from '~/lib/prisma.server';
import {
  addMember,
  createCompetition,
  createDivision,
  createStarter,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { callRoute } from '~/tests/starterRoutes';
import { loader } from './search';

beforeEach(truncateTables);

it('finds people, clubs and divisions for viewers', async () => {
  const { id, contest } = await createCompetition();
  const viewer = await createUser();
  await addMember(id, viewer.id, 'VIEWER');
  const running = await createDivision(contest.id, { state: 'RUNNING' });
  const planned = await createDivision(contest.id, { number: 2 });
  await createStarter(id, {
    lastname: 'A',
    divisionId: running.id,
    startApparatus: 'reck',
  });
  await createStarter(id, { lastname: 'B', divisionId: planned.id, startApparatus: 'reck' });
  await createStarter(id, { lastname: 'C' });
  await createStarter((await createCompetition()).id, { lastname: 'D' });

  const { data } = await callRoute(loader, {
    layout: 'api',
    userId: viewer.id,
    competitionId: id,
  });
  const { starters, clubs, divisions } = data;
  expect(starters).toMatchObject([
    { division: { id: running.id, state: 'RUNNING' } },
    { division: { id: planned.id } },
    { division: null },
  ]);
  const ownClubs = await prisma.club.findMany({
    where: { starters: { some: { competitionId: id } } },
    orderBy: [{ name: 'asc' }, { location: 'asc' }],
  });
  expect(clubs).toEqual(ownClubs);
  expect(divisions.map((division: { id: string }) => division.id)).toEqual([
    running.id,
    planned.id,
  ]);
});

it('is hidden from strangers', async () => {
  const { id: competitionId } = await createCompetition();
  const { id: userId } = await createUser();
  expect((await callRoute(loader, { layout: 'api', userId, competitionId })).status).toBe(404);
});
