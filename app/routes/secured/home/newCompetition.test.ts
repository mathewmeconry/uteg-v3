import { getLogo } from '~/lib/assets.server';
import { listMembers } from '~/lib/competitions.server';
import { listInvitations } from '~/lib/invitations.server';
import { sendMail } from '~/lib/mail.server';
import { prisma } from '~/lib/prisma.server';
import { egtModule } from '~/modules/egt/module';
import { callRoute } from '~/tests/competitionRoutes';
import { createUser, truncateTables } from '~/tests/helpers';
import { createPng } from '~/tests/images';
import { action } from './newCompetition';

const PNG = createPng();
// 8000 pixels wide.
const HUGE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 50, 0x1f, 0x40, 1, 1, 1]);

const FORM = {
  name: 'Gerätecup',
  location: 'Zürich',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  grounds: '2',
  modules: 'egt',
  'config.egt': JSON.stringify({
    ...egtModule.defaultConfig,
    honourPercent: { ...egtModule.defaultConfig.honourPercent, MALE: { K5: 40 } },
  }),
  members: '[]',
};

beforeEach(truncateTables);

describe('create competition', () => {
  it('creates it with logo, config and members', async () => {
    const user = await createUser();
    const helper = await createUser({ email: 'helper@example.com' });
    const result = await callRoute(action, {
      userId: user.id,
      form: {
        ...FORM,
        logo: new Blob([PNG]),
        members: JSON.stringify([{ email: 'Helper@example.com', role: 'EDITOR' }]),
      },
    });

    const competition = await prisma.competition.findFirstOrThrow({ include: { contests: true } });
    expect(result).toMatchObject({ status: 302, location: `/competitions/${competition.id}` });
    expect(competition).toMatchObject({
      name: 'Gerätecup',
      location: 'Zürich',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-02'),
      grounds: 2,
      contests: [{ module: 'egt', config: { honourPercent: { MALE: { K5: 40 } } } }],
    });
    expect(await getLogo(competition.id)).toMatchObject({ mimeType: 'image/png' });
    expect(await listMembers(competition.id)).toMatchObject([
      { userId: user.id, role: 'OWNER' },
      { userId: helper.id, role: 'EDITOR' },
    ]);
  });

  it.each([
    ['name', { name: ' ' }, 'name'],
    ['date', { startDate: '2026-02-31' }, 'startDate'],
    ['end before the start', { endDate: '2026-04-30' }, 'endDate'],
    ['grounds', { grounds: '0' }, 'grounds'],
    ['no module', { modules: [] }, 'modules'],
    ['unknown module', { modules: 'nope' }, 'modules'],
    ['config', { 'config.egt': '{"precision":7}' }, 'config'],
    ['broken config', { 'config.egt': '{' }, 'config'],
    ['logo', { logo: new Blob(['<svg/>']) }, 'logo'],
    ['large logo', { logo: new Blob([HUGE_JPEG]) }, 'logo'],
    ['broken members', { members: 'x' }, 'members'],
    ['member role', { members: '[{"email":"a@b.ch","role":"ADMIN"}]' }, 'members'],
  ])('reports an invalid field and creates nothing: %s', async (_, form, field) => {
    const user = await createUser();
    const { status, data } = await callRoute(action, {
      userId: user.id,
      form: { ...FORM, ...form } as any,
    });
    expect(status).toBe(400);
    expect(Object.keys(data.errors)).toEqual([field]);
    expect(await prisma.competition.count()).toBe(0);
  });

  it('invites members without an account and names those whose mail failed', async () => {
    const user = await createUser();
    const helper = await createUser({ email: 'helper@example.com' });
    const members = JSON.stringify([
      { email: 'helper@example.com', role: 'EDITOR' },
      { email: 'Failed@example.com', role: 'EDITOR' },
      { email: 'new@example.com', role: 'VIEWER' },
    ]);
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('Resend answered 500'));
    const result = await callRoute(action, { userId: user.id, form: { ...FORM, members } });
    expect(result.status).toBe(302);
    expect(result.toasts).toMatchObject([
      { type: 'success' },
      { type: 'error', message: expect.stringContaining('failed@example.com.') },
    ]);

    const { id } = await prisma.competition.findFirstOrThrow();
    expect(await listMembers(id)).toMatchObject([{ userId: user.id }, { userId: helper.id }]);
    expect(await listInvitations(id)).toMatchObject([
      { email: 'failed@example.com', role: 'EDITOR' },
      { email: 'new@example.com', role: 'VIEWER' },
    ]);
    expect(vi.mocked(sendMail).mock.lastCall![0].to).toBe('new@example.com');
  });

  it('limits the invitations and names the others', async () => {
    const user = await createUser();
    const members = JSON.stringify(
      Array.from({ length: 31 }, (_, i) => ({ email: `m${i}@example.com`, role: 'VIEWER' })),
    );
    const { toasts } = await callRoute(action, { userId: user.id, form: { ...FORM, members } });
    expect(await prisma.invitation.count()).toBe(30);
    expect(toasts[1].message).toContain('m30@example.com');
  });

  it.each([
    ['an invalid address', [{ email: 'not.valid', role: 'VIEWER' }], 'not.valid'],
    ['the creator', [{ email: 'Me@example.com', role: 'VIEWER' }], 'me@example.com'],
    [
      'a duplicate',
      [
        { email: 'a@example.com', role: 'VIEWER' },
        { email: 'A@example.com', role: 'EDITOR' },
      ],
      'a@example.com',
    ],
  ])('names %s', async (_, members, named) => {
    const user = await createUser({ email: 'me@example.com' });
    await createUser({ email: 'a@example.com' });
    const { status, data } = await callRoute(action, {
      userId: user.id,
      form: { ...FORM, members: JSON.stringify(members) },
    });
    expect(status).toBe(400);
    expect(data.errors.members).toContain(named);
    expect(await prisma.competition.count()).toBe(0);
  });

  it('creates nothing when the logo cannot be stored', async () => {
    const user = await createUser();
    await prisma.$executeRaw`ALTER TABLE asset ADD CONSTRAINT no_assets CHECK (false)`;
    try {
      const form = { ...FORM, logo: new Blob([PNG]) };
      await expect(callRoute(action, { userId: user.id, form })).rejects.toThrow();
    } finally {
      await prisma.$executeRaw`ALTER TABLE asset DROP CONSTRAINT no_assets`;
    }
    expect(await prisma.competition.count()).toBe(0);
  });

  it('refuses the creator as another member', async () => {
    const user = await createUser({ email: 'me@example.com' });
    const members = JSON.stringify([{ email: 'me@example.com', role: 'VIEWER' }]);
    const { status, data } = await callRoute(action, {
      userId: user.id,
      form: { ...FORM, members },
    });
    expect(status).toBe(400);
    expect(Object.keys(data.errors)).toEqual(['members']);
  });
});
