import { RouterContextProvider } from 'react-router';
import { competitionContext, userContext } from '~/context';
import { getCompetitionForUser } from '~/lib/competitions.server';
import { publish } from '~/lib/events.server';
import { prisma } from '~/lib/prisma.server';
import { createCompetition, truncateTables } from '~/tests/helpers';
import { signUp } from '~/tests/signUp';
import { loader } from './events';

beforeEach(truncateTables);

async function open() {
  const { user, cookie } = await signUp({ email: 'a@example.com', password: 'only-for-tests' });
  const competition = await createCompetition({ ownerId: user.id });
  const context = new RouterContextProvider();
  context.set(userContext, user as any);
  context.set(competitionContext, await getCompetitionForUser(user.id, competition.id));
  const request = new Request('http://localhost/api/events/x', { headers: { cookie } });
  const stream = (loader({ request, context } as any) as Response).body!.getReader();
  await stream.read();
  const next = async () => {
    publish(competition.id, 'grades');
    const { value, done } = await stream.read();
    return done ? null : new TextDecoder().decode(value);
  };
  return { next };
}

it('sends events while the user is signed in', async () => {
  const { next } = await open();
  expect(await next()).toBe('data: grades\n\n');
});

it.each(['deleted', 'expired'])('ends when the session is %s', async (reason) => {
  const { next } = await open();
  if (reason === 'deleted') await prisma.session.deleteMany();
  else await prisma.session.updateMany({ data: { expiresAt: new Date(0) } });
  expect(await next()).toBeNull();
});

it('ends when the membership is removed', async () => {
  const { next } = await open();
  await prisma.member.deleteMany();
  expect(await next()).toBeNull();
});
