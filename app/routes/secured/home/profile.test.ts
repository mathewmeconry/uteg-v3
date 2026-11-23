import { RouterContextProvider } from 'react-router';
import { userContext } from '~/context';
import { auth, authCookies } from '~/lib/auth/auth.server';
import { prisma } from '~/lib/prisma.server';
import { truncateTables } from '~/tests/helpers';
import { action } from './profile';

beforeEach(truncateTables);

const PASSWORD = 'only-for-tests';

async function signUp(email: string) {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, name: email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = authCookies({ headers })
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  return async (newEmail: string, password: string) => {
    const context = new RouterContextProvider();
    context.set(userContext, response.user as any);
    const body = new URLSearchParams({
      intent: 'email',
      email: newEmail,
      emailPassword: password,
    });
    const request = new Request('http://localhost/profile', {
      method: 'POST',
      headers: { cookie },
      body,
    });
    const result: any = await action({ request, context } as any);
    return result.init?.status ?? result.status;
  };
}

it('limits guessing the password with the email form', async () => {
  const change = await signUp('a@example.com');
  for (let attempt = 0; attempt < 10; attempt++) {
    expect(await change('b@example.com', 'wrong')).toBe(400);
  }
  expect(await change('b@example.com', PASSWORD)).toBe(429);
  expect(await prisma.user.count({ where: { email: 'a@example.com' } })).toBe(1);

  // Others are not affected.
  const other = await signUp('c@example.com');
  expect(await other('d@example.com', PASSWORD)).toBe(302);
  expect(await prisma.user.count({ where: { email: 'd@example.com' } })).toBe(1);
});
