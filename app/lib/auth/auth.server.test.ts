import { RouterContextProvider } from 'react-router';
import { sendMail } from '~/lib/mail.server';
import { prisma } from '~/lib/prisma.server';
import { action } from '~/routes/auth/verifyEmail';
import { createCompetition, truncateTables } from '~/tests/helpers';
import { auth, callAuth } from './auth.server';

beforeEach(truncateTables);
beforeEach(() => {
  vi.mocked(sendMail).mockClear();
});

const EMAIL = 'a@example.com';
const PASSWORD = 'only-for-tests';

const register = () =>
  auth.api.signUpEmail({ body: { email: EMAIL, name: EMAIL, password: PASSWORD } });
const signIn = (password = PASSWORD) => auth.api.signInEmail({ body: { email: EMAIL, password } });

function inLastMail(pattern: RegExp) {
  return vi.waitFor(() => {
    const [value] = pattern.exec(vi.mocked(sendMail).mock.lastCall?.[0].text ?? '') ?? [];
    if (!value) throw new Error('No mail with it');
    return value;
  });
}
const lastCode = () => inLastMail(/\b\d{6}\b/);
const lastToken = () => inLastMail(/(?<=token=)\S+/);

async function verify(form: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ email: EMAIL, ...form });
  const request = new Request('http://localhost/verify-email', { method: 'POST', body });
  return action({ request, context: new RouterContextProvider() } as any);
}

async function invite() {
  const { id } = await createCompetition();
  await prisma.invitation.create({ data: { competitionId: id, email: EMAIL, role: 'EDITOR' } });
}

const memberships = () => prisma.member.findMany({ where: { user: { email: EMAIL } } });

it('needs a verified address to log in and to accept invitations', async () => {
  await invite();
  await register();
  await expect(signIn()).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });
  await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(2));
  expect(await memberships()).toEqual([]);

  expect((await verify({ code: await lastCode() })).headers.getSetCookie()).not.toEqual([]);
  expect((await signIn()).token).toBeTruthy();
  expect(await memberships()).toMatchObject([{ role: 'EDITOR' }]);
  expect(await prisma.invitation.count()).toBe(0);
});

it('needs a new code after three wrong ones', async () => {
  await register();
  const code = await lastCode();
  for (let attempt = 0; attempt < 3; attempt++) {
    expect((await verify({ code: 'x' })).init.status).toBe(400);
  }
  expect((await verify({ code })).init.status).toBe(400);

  vi.mocked(sendMail).mockClear();
  await verify({ intent: 'resend' });
  expect((await verify({ code: await lastCode() })).status).toBe(302);

  // Nothing is sent to verified addresses.
  vi.mocked(sendMail).mockClear();
  await verify({ intent: 'resend' });
  expect(sendMail).not.toHaveBeenCalled();
});

it('limits the attempts per address', async () => {
  const email = 'limited@example.com';
  for (let attempt = 0; attempt < 20; attempt++) await verify({ email, code: 'x' });
  expect((await verify({ email, code: 'x' })).init.status).toBe(429);
});

it.each(['/email-otp/verify-email', '/email-otp/send-verification-otp', '/sign-in/email-otp'])(
  'does not offer %s without that limit',
  async (path) => {
    const response = await callAuth(new Request('http://localhost'), path, { email: EMAIL });
    expect(response.status).toBe(404);
  },
);

it('resets the password once,which also verifies the address', async () => {
  await invite();
  await register();
  await auth.api.requestPasswordReset({ body: { email: EMAIL } });
  const body = { token: await lastToken(), newPassword: 'another-for-tests' };
  await auth.api.resetPassword({ body });
  await expect(signIn()).rejects.toThrow();
  expect((await signIn(body.newPassword)).token).toBeTruthy();
  expect(await memberships()).toHaveLength(1);
  await expect(auth.api.resetPassword({ body })).rejects.toThrow();
});

it('sets the first password of accounts without one', async () => {
  await prisma.user.create({ data: { id: 'v2', name: 'a', email: EMAIL } });
  await auth.api.requestPasswordReset({ body: { email: EMAIL } });
  await auth.api.resetPassword({ body: { token: await lastToken(), newPassword: PASSWORD } });
  expect((await signIn()).token).toBeTruthy();
});

it('does not tell whether an address has an account', async () => {
  await register();
  const again = await register();
  expect(again.token).toBeNull();
  expect(vi.mocked(sendMail).mock.lastCall![0].text).toContain('/forgot-password');
  expect(await prisma.user.count()).toBe(1);

  vi.mocked(sendMail).mockClear();
  await auth.api.requestPasswordReset({ body: { email: 'nobody@example.com' } });
  expect(sendMail).not.toHaveBeenCalled();
});
