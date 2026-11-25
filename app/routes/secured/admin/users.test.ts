import { RouterContextProvider } from 'react-router';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import routes from '~/routes';
import { userContext } from '~/context';
import { listAllCompetitions, listUsers } from '~/lib/admin.server';
import { sendMail } from '~/lib/mail.server';
import { prisma } from '~/lib/prisma.server';
import { adminMiddleware } from '~/middlewares/admin.server';
import { addMember, createCompetition, createUser, truncateTables } from '~/tests/helpers';
import { callAction, statusOf } from '~/tests/routeContext';
import { signUp } from '~/tests/signUp';
import { middleware } from './layout';
import { action } from './users';

beforeEach(truncateTables);

function contextOf(user: { id: string }) {
  const context = new RouterContextProvider();
  context.set(userContext, user as any);
  return context;
}

async function createAdmin() {
  const { id } = await createUser({ email: 'admin@example.com' });
  return prisma.user.update({ where: { id }, data: { isAdmin: true } });
}

async function run(intent: string, userId: string) {
  return callAction(action, contextOf(await createAdmin()), { intent, userId });
}

const sessionsOf = (userId: string) => prisma.session.count({ where: { userId } });

describe('access', () => {
  it('is only for admins, as the database says right now', async () => {
    const admin = await createAdmin();
    const enter = () =>
      statusOf(async () =>
        adminMiddleware({ context: contextOf(admin) } as any, async () => new Response()),
      );
    expect(await enter()).toBe(200);
    await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: false } });
    expect(await enter()).toBe(404);
  });

  it('is checked around all admin pages', () => {
    function find(entries: RouteConfigEntry[], file: string): RouteConfigEntry | undefined {
      for (const entry of entries) {
        const found = entry.file === file ? entry : find(entry.children ?? [], file);
        if (found) return found;
      }
    }
    const all = routes as RouteConfigEntry[];
    const secured = find(all, 'routes/secured/layout.tsx')!;
    const layout = find(secured.children!, 'routes/secured/admin/layout.tsx')!;
    expect(layout.children!.map(({ file }) => file)).toEqual([
      'routes/secured/admin/users.tsx',
      'routes/secured/admin/competitions.tsx',
    ]);
    expect(middleware).toEqual([adminMiddleware]);
  });
});

it('lists users with their competitions and activity', async () => {
  const { user } = await signUp({ email: 'a@example.com', password: 'only-for-tests' });
  const competition = await createCompetition({ ownerId: user.id });
  const other = await createUser();

  const users = await listUsers();
  expect(users.find(({ id }) => id === user.id)).toMatchObject({
    lastActive: expect.any(Date),
    memberships: [{ role: 'OWNER', competition: { id: competition.id } }],
  });
  expect(users.find(({ id }) => id === other.id)).toMatchObject({
    lastActive: null,
    memberships: [],
  });
  expect(await listAllCompetitions()).toMatchObject([
    { id: competition.id, owners: ['a@example.com'], starters: 0 },
  ]);
});

it('sends a link for a new password', async () => {
  const { id } = await createUser({ email: 'reset@example.com' });
  expect(await run('resetPassword', id)).toMatchObject({ error: undefined });
  await vi.waitFor(() =>
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'reset@example.com' })),
  );
});

it('signs a user out everywhere, others stay signed in', async () => {
  const { user } = await signUp({ email: 'b@example.com', password: 'only-for-tests' });
  const { user: other } = await signUp({ email: 'c@example.com', password: 'only-for-tests' });
  await run('signOut', user.id);
  expect(await sessionsOf(user.id)).toBe(0);
  expect(await sessionsOf(other.id)).toBe(1);
});

describe('deleting', () => {
  it('removes the account and keeps the competitions', async () => {
    const competition = await createCompetition();
    const { user } = await signUp({ email: 'd@example.com', password: 'only-for-tests' });
    await addMember(competition.id, user.id, 'OWNER');
    await run('delete', user.id);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await sessionsOf(user.id)).toBe(0);
    expect(await prisma.member.count({ where: { competitionId: competition.id } })).toBe(1);
  });

  it('is refused for the last owner of a competition', async () => {
    const { id, ownerId } = await createCompetition();
    await addMember(id, (await createUser()).id, 'EDITOR');
    expect(await run('delete', ownerId)).toMatchObject({ status: 400 });
    expect(await prisma.user.count({ where: { id: ownerId } })).toBe(1);
  });

  it('is refused for admins', async () => {
    const { id } = await createUser();
    await prisma.user.update({ where: { id }, data: { isAdmin: true } });
    expect(await run('delete', id)).toMatchObject({ status: 403 });
    expect(await prisma.user.count({ where: { id } })).toBe(1);
  });

  it('answers unknown users with 404', async () => {
    expect(await run('delete', 'unknown')).toMatchObject({ status: 404 });
  });
});
