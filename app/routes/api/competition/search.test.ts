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

it('finds people and divisions for viewers, and where they are now', async () => {
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
  const load = async () =>
    (await callRoute(loader, { layout: 'api', userId: viewer.id, competitionId: id })).data;

  const { starters, divisions } = await load();
  expect(starters).toMatchObject([
    { division: { id: running.id, state: 'RUNNING' }, apparatus: 'reck' },
    { division: { id: planned.id }, apparatus: null },
    { division: null, apparatus: null },
  ]);
  expect(divisions.map((division: { id: string }) => division.id)).toEqual([
    running.id,
    planned.id,
  ]);

  // Everybody has moved on by one.
  await prisma.divisionApparatus.updateMany({
    where: { divisionId: running.id },
    data: { completedRounds: 1 },
  });
  expect((await load()).starters[0].apparatus).toBe('boden');
});

it('is hidden from strangers', async () => {
  const { id: competitionId } = await createCompetition();
  const { id: userId } = await createUser();
  expect((await callRoute(loader, { layout: 'api', userId, competitionId })).status).toBe(404);
});
