import type { Role } from '~/generated/prisma/client';
import { getLogo } from '~/lib/assets.server';
import { prisma } from '~/lib/prisma.server';
import { callRoute } from '~/tests/competitionRoutes';
import {
  addMember,
  createCompetition,
  createDivision,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { action } from './settings';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const DETAILS = {
  intent: 'details',
  name: 'Neuer Name',
  location: 'Bern',
  startDate: '2026-06-01',
  endDate: '2026-06-03',
  grounds: '2',
};
// 8000 pixels wide.
const HUGE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 50, 0x1f, 0x40, 1, 1, 1]);
const LOGO = { intent: 'logo', logo: new Blob([JPEG]) };

beforeEach(truncateTables);

async function setup(role: Role = 'OWNER') {
  const competition = await createCompetition({ name: 'Cup', grounds: 2 });
  const { id: userId } = await createUser();
  await addMember(competition.id, userId, role);
  return {
    competition,
    post: (form: Record<string, string | Blob>, competitionId = competition.id) =>
      callRoute(action, { userId, competitionId, form }),
  };
}

describe('competition settings', () => {
  it('saves name, location, dates and grounds', async () => {
    const { competition, post } = await setup('EDITOR');
    expect((await post(DETAILS)).status).toBe(302);
    const saved = await prisma.competition.findUnique({ where: { id: competition.id } });
    expect(saved).toMatchObject({
      name: 'Neuer Name',
      location: 'Bern',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-03'),
      grounds: 2,
    });
  });

  it.each([
    ['name', { name: '' }],
    ['endDate', { endDate: '2026-05-31' }],
    ['grounds', { grounds: '1.5' }],
  ])('reports an invalid %s', async (field, form) => {
    const { post } = await setup();
    const { status, data } = await post({ ...DETAILS, ...form });
    expect(status).toBe(400);
    expect(Object.keys(data.errors)).toEqual([field]);
  });

  it('does not remove a ground in use', async () => {
    const { competition, post } = await setup();
    await createDivision(competition.contest.id, { ground: 2 });
    const { status, data } = await post({ ...DETAILS, grounds: '1' });
    expect(status).toBe(400);
    expect(Object.keys(data.errors)).toEqual(['grounds']);
  });

  it('sets and removes the logo', async () => {
    const { competition, post } = await setup('EDITOR');
    expect((await post(LOGO)).status).toBe(302);
    expect(await getLogo(competition.id)).toMatchObject({ mimeType: 'image/jpeg' });
    expect((await post({ intent: 'removeLogo' })).status).toBe(302);
    expect(await getLogo(competition.id)).toBeNull();
  });

  it.each([
    ['no file', { intent: 'logo' }],
    ['empty file', { intent: 'logo', logo: new Blob([]) }],
    ['too many pixels', { intent: 'logo', logo: new Blob([HUGE_JPEG]) }],
    ['no image', { intent: 'logo', logo: new Blob(['GIF89a']) }],
  ])('rejects a logo: %s', async (_, form) => {
    const { post } = await setup();
    const { status, data } = await post(form as Record<string, string | Blob>);
    expect(status).toBe(400);
    expect(Object.keys(data.errors)).toEqual(['logo']);
  });

  it('deletes the competition when the owner types its name', async () => {
    const { competition, post } = await setup();
    const wrong = await post({ intent: 'delete', confirmName: 'cup' });
    expect(wrong.status).toBe(400);
    expect(Object.keys(wrong.data.errors)).toEqual(['confirmName']);
    const right = await post({ intent: 'delete', confirmName: ' Cup ' });
    expect(right).toMatchObject({ status: 302, location: '/home' });
    expect(await prisma.competition.count({ where: { id: competition.id } })).toBe(0);
  });

  it('rejects an unknown intent', async () => {
    const { post } = await setup();
    expect((await post({ intent: 'nope' })).status).toBe(400);
  });

  it.each([
    ['VIEWER', DETAILS],
    ['VIEWER', LOGO],
    ['VIEWER', { intent: 'removeLogo' }],
    ['VIEWER', { intent: 'delete', confirmName: 'Cup' }],
    ['EDITOR', { intent: 'delete', confirmName: 'Cup' }],
  ] as const)('denies a %s: %o', async (role, form) => {
    const { competition, post } = await setup(role);
    expect((await post(form)).status).toBe(403);
    expect(await prisma.competition.findUnique({ where: { id: competition.id } })).toMatchObject({
      name: 'Cup',
      logoId: null,
    });
  });

  it('hides other competitions', async () => {
    const { post } = await setup();
    const other = await createCompetition({ name: 'Cup' });
    expect((await post(DETAILS, other.id)).status).toBe(404);
    expect((await post({ intent: 'delete', confirmName: 'Cup' }, other.id)).status).toBe(404);
    expect(await prisma.competition.count({ where: { id: other.id, name: 'Cup' } })).toBe(1);
  });
});
