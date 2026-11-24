import { beforeEach, expect, it } from 'vitest';
import { withdrawStarters } from '~/lib/starters.server';
import {
  addMember,
  createCompetition,
  createStarter,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { callRoute } from '~/tests/starterRoutes';
import { loader } from './starters';

beforeEach(truncateTables);

async function setup() {
  const { id: competitionId, contest, ownerId } = await createCompetition();
  const call = (ids: string[], { userId = ownerId, contestId = contest.id } = {}) => {
    const search = new URLSearchParams([['contest', contestId], ...ids.map((id) => ['id', id])]);
    return callRoute(loader, { layout: 'api', userId, competitionId, search: `?${search}` });
  };
  return { competitionId, call };
}

it('returns the wanted rows of the competition, without removed ones', async () => {
  const { competitionId, call } = await setup();
  const viewer = await createUser();
  await addMember(competitionId, viewer.id, 'VIEWER');
  const a = await createStarter(competitionId);
  const b = await createStarter(competitionId);
  await createStarter(competitionId);
  const foreign = await createStarter((await createCompetition()).id);
  await withdrawStarters(competitionId, [b.id]);

  const { data } = await call([a.id, b.id, foreign.id], { userId: viewer.id });
  expect(data.starters).toMatchObject([{ id: a.id, entryId: a.entry.id, category: 'K5' }]);
  expect(data.contest.categories.MALE).toContain('KH');
});

it('rejects other contests, invalid ids and strangers', async () => {
  const { call } = await setup();
  const other = await createCompetition();
  expect((await call(['a'], { contestId: other.contest.id })).status).toBe(404);
  expect((await call(['a'], { userId: (await createUser()).id })).status).toBe(404);
  for (const ids of [[], ['\0'], Array(51).fill('a')]) {
    expect((await call(ids)).status).toBe(400);
  }
});
