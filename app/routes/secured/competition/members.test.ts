import type { Role } from '~/generated/prisma/client';
import { listMembers } from '~/lib/competitions.server';
import { removeInvitation } from '~/lib/invitations.server';
import { sendMail } from '~/lib/mail.server';
import { prisma } from '~/lib/prisma.server';
import { callRoute } from '~/tests/competitionRoutes';
import { addMember, createCompetition, createUser, truncateTables } from '~/tests/helpers';
import { action, loader } from './members';

beforeEach(truncateTables);

async function setup(role: Role = 'OWNER') {
  const owner = await createUser({ email: 'owner@example.com' });
  const competition = await createCompetition({ ownerId: owner.id });
  const user = await createUser({ email: 'me@example.com' });
  await addMember(competition.id, user.id, role);
  const call = { userId: user.id, competitionId: competition.id };
  return {
    competition,
    owner,
    user,
    load: () => callRoute(loader, call),
    post: (form: Record<string, string>, competitionId = competition.id) =>
      callRoute(action, { ...call, competitionId, form }),
  };
}

const roleOf = async (competitionId: string, userId: string) =>
  (
    await prisma.member.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
    })
  )?.role ?? null;

describe('members', () => {
  it('lists members with email and role', async () => {
    const { load, user, owner } = await setup('VIEWER');
    expect((await load()).data.members).toEqual([
      { userId: owner.id, email: 'owner@example.com', role: 'OWNER' },
      { userId: user.id, email: 'me@example.com', role: 'VIEWER' },
    ]);
  });

  it('adds a member by email', async () => {
    const { competition, post } = await setup();
    const helper = await createUser({ email: 'helper@example.com' });
    const result = await post({ intent: 'add', email: 'Helper@example.com ', role: 'EDITOR' });
    expect(result.status).toBe(302);
    expect(await roleOf(competition.id, helper.id)).toBe('EDITOR');
  });

  it.each([
    ['a member', 'owner@example.com'],
    ['no address', 'x'],
  ])('does not add %s', async (_, email) => {
    const { competition, post } = await setup();
    const { status, data } = await post({ intent: 'add', email, role: 'VIEWER' });
    expect(status).toBe(400);
    expect(Object.keys(data.errors)).toEqual(['email']);
    expect(await listMembers(competition.id)).toHaveLength(2);
  });

  it('invites an address without an account, again with another role', async () => {
    const { competition, load, post } = await setup();
    await post({ intent: 'add', email: ' New@example.com', role: 'VIEWER' });
    await post({ intent: 'add', email: 'new@example.com', role: 'EDITOR' });
    const { invitations } = (await load()).data;
    expect(invitations).toMatchObject([{ email: 'new@example.com', role: 'EDITOR' }]);
    expect(vi.mocked(sendMail).mock.lastCall![0]).toMatchObject({
      to: 'new@example.com',
      subject: expect.stringContaining(competition.name),
      text: expect.stringContaining('/register'),
    });

    // Not from another competition.
    const other = await createCompetition();
    await removeInvitation(other.id, invitations[0].id);
    expect((await load()).data.invitations).toHaveLength(1);
    await post({ intent: 'withdraw', invitationId: invitations[0].id });
    expect((await load()).data.invitations).toEqual([]);
  });

  it('keeps an invitation whose mail could not be sent', async () => {
    const { load, post } = await setup();
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('Resend answered 500'));
    const { toasts } = await post({ intent: 'add', email: 'new@example.com', role: 'VIEWER' });
    expect(toasts).toMatchObject([{ type: 'error' }]);
    expect((await load()).data.invitations).toHaveLength(1);
  });

  it('changes roles and removes members', async () => {
    const { competition, owner, post } = await setup();
    await post({ intent: 'role', userId: owner.id, role: 'VIEWER' });
    expect(await roleOf(competition.id, owner.id)).toBe('VIEWER');
    await post({ intent: 'remove', userId: owner.id });
    expect(await roleOf(competition.id, owner.id)).toBeNull();
  });

  it('rejects an unknown role', async () => {
    const { owner, post } = await setup();
    expect((await post({ intent: 'role', userId: owner.id, role: 'ADMIN' })).status).toBe(400);
  });

  it('sends members who left to their competitions', async () => {
    const { competition, user, post } = await setup();
    expect(await post({ intent: 'remove', userId: user.id })).toMatchObject({
      status: 302,
      location: '/home',
    });
    expect(await roleOf(competition.id, user.id)).toBeNull();
  });

  it('keeps the last owner and says why', async () => {
    const { competition, owner, user, post } = await setup();
    await post({ intent: 'remove', userId: owner.id });
    for (const form of [{ intent: 'remove' }, { intent: 'role', role: 'EDITOR' }]) {
      const result = await post({ ...form, userId: user.id } as Record<string, string>);
      expect(result.status).toBe(400);
      expect(result.data).toEqual({ error: expect.stringContaining('Inhaber') });
    }
    expect(await roleOf(competition.id, user.id)).toBe('OWNER');
  });

  it.each(['VIEWER', 'EDITOR'] as const)('denies a %s', async (role) => {
    const { competition, owner, post } = await setup(role);
    await createUser({ email: 'helper@example.com' });
    const forms: Record<string, string>[] = [
      { intent: 'add', email: 'helper@example.com', role: 'OWNER' },
      { intent: 'withdraw', invitationId: 'x' },
      { intent: 'role', userId: owner.id, role: 'VIEWER' },
      { intent: 'remove', userId: owner.id },
    ];
    for (const form of forms) expect((await post(form)).status).toBe(403);
    expect(await listMembers(competition.id)).toMatchObject([{ role: 'OWNER' }, { role }]);
  });

  it('hides other competitions and their members', async () => {
    const { competition, post } = await setup();
    const other = await createCompetition();
    const remove = { intent: 'remove', userId: other.ownerId };
    expect((await post(remove, other.id)).status).toBe(404);
    expect((await post(remove, competition.id)).status).toBe(404);
    expect(await roleOf(other.id, other.ownerId)).toBe('OWNER');
  });
});
