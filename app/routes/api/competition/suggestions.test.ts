import { beforeEach, expect, it } from 'vitest';
import { prisma } from '~/lib/prisma.server';
import {
  addMember,
  createCompetition,
  createStarter,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { callRoute } from '~/tests/starterRoutes';
import { action as athletes } from './athletes';
import { action as clubs } from './clubs';

beforeEach(truncateTables);

it('suggests athletes of all competitions to editors', async () => {
  const competition = await createCompetition();
  const other = await createCompetition();
  const starter = await createStarter(other.id, { firstname: 'Anna', stvId: '77123' });
  const editor = await createUser();
  await addMember(competition.id, editor.id, 'EDITOR');

  for (const query of ['ann', '7712']) {
    const { data } = await callRoute(athletes, {
      layout: 'api',
      userId: editor.id,
      competitionId: competition.id,
      body: new URLSearchParams({ query }),
    });
    expect(data.athletes).toMatchObject([
      { athleteId: starter.athleteId, firstname: 'Anna', stvId: '77123' },
    ]);
  }
});

it('does not suggest athletes to viewers, strangers and visitors', async () => {
  const competition = await createCompetition();
  const viewer = await createUser();
  await addMember(competition.id, viewer.id, 'VIEWER');
  const stranger = await createUser();
  const call = async (userId: string | null) =>
    (
      await callRoute(athletes, {
        layout: 'api',
        userId,
        competitionId: competition.id,
        body: new URLSearchParams({ query: 'anna' }),
      })
    ).status;
  expect(await call(viewer.id)).toBe(403);
  expect(await call(stranger.id)).toBe(404);
  expect(await call(null)).toBe(302);
});

it('creates clubs for editors', async () => {
  const competition = await createCompetition();
  const call = (body: URLSearchParams, userId: string | null = competition.ownerId) =>
    callRoute(clubs, { layout: 'api', userId, competitionId: competition.id, body });
  const body = () => new URLSearchParams({ name: 'TV Chur', location: 'Chur' });

  const { data } = await call(body());
  expect(data.club).toMatchObject({ name: 'TV Chur', location: 'Chur' });
  expect((await call(body())).data.club.id).toBe(data.club.id);

  const invalid = await call(new URLSearchParams({ name: 'TV Chur', location: ' ' }));
  expect(invalid.status).toBe(400);
  expect(invalid.data.errors).toEqual({ location: 'Bitte ausfüllen' });

  const viewer = await createUser();
  await addMember(competition.id, viewer.id, 'VIEWER');
  expect((await call(body(), viewer.id)).status).toBe(403);
  expect((await call(body(), (await createUser()).id)).status).toBe(404);
  expect((await call(body(), null)).status).toBe(302);
  expect(await prisma.club.count()).toBe(1);
});
