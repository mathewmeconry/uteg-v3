import { RouterContextProvider } from 'react-router';
import { userContext } from '~/context';
import { sendMail } from '~/lib/mail.server';
import { prisma } from '~/lib/prisma.server';
import { truncateTables } from '~/tests/helpers';
import { signUp } from '~/tests/signUp';
import { action } from './profile';

beforeEach(truncateTables);

const PASSWORD = 'only-for-tests';

async function setup(email: string) {
  const { user, cookie } = await signUp({ email, password: PASSWORD });

  const post = async (form: Record<string, string>) => {
    const context = new RouterContextProvider();
    context.set(userContext, user as any);
    const request = new Request('http://localhost/profile', {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams(form),
    });
    const result: any = await action({ request, context } as any);
    return result.init?.status ?? result.status ?? 200;
  };
  return {
    change: (newEmail: string, password: string) =>
      post({ intent: 'email', email: newEmail, emailPassword: password }),
    enterCode: (newEmail: string, code: string) => post({ intent: 'emailCode', newEmail, code }),
  };
}

it('limits guessing the password with the email form', async () => {
  const { change } = await setup('a@example.com');
  for (let attempt = 0; attempt < 10; attempt++) {
    expect(await change('b@example.com', 'wrong')).toBe(400);
  }
  expect(await change('b@example.com', PASSWORD)).toBe(429);
  expect(await prisma.user.count({ where: { email: 'a@example.com' } })).toBe(1);

  // Others are not affected.
  const other = await setup('c@example.com');
  expect(await other.change('d@example.com', PASSWORD)).toBe(200);
});

it('changes the address with the code sent to the new one', async () => {
  const { change, enterCode } = await setup('e@example.com');
  expect(await change('f@example.com', PASSWORD)).toBe(200);
  const toNew = expect.objectContaining({ to: 'f@example.com' });
  await vi.waitFor(() => expect(sendMail).toHaveBeenLastCalledWith(toNew));
  const { text } = vi.mocked(sendMail).mock.lastCall![0];
  const code = /\b\d{6}\b/.exec(text)![0];

  expect(await enterCode('f@example.com', 'x')).toBe(400);
  expect(await enterCode('g@example.com', code)).toBe(400);
  expect(await prisma.user.count({ where: { email: 'e@example.com' } })).toBe(1);

  expect(await enterCode('f@example.com', code)).toBe(302);
  expect(await prisma.user.findMany()).toMatchObject([
    { email: 'f@example.com', name: 'f@example.com', emailVerified: true },
  ]);
});
