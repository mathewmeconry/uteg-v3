import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { redirect } from 'react-router';
import { z } from 'zod';
import { userContext, type Context } from '~/context';
import { APP_ORIGIN, env } from '~/lib/env.server';
import { acceptInvitations } from '~/lib/invitations.server';
import { prisma } from '~/lib/prisma.server';
import { LANGUAGES } from '~/locales';
import { sendCodeMail, sendExistingAccountMail, sendResetMail } from './authMails.server';

/** Set by the proxy, see README. */
export const CLIENT_ADDRESS_HEADER = 'x-real-ip';

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => sendResetMail(user, token),
    onExistingUserSignUp: async ({ user }) => sendExistingAccountMail(user),
    // The link in the mail also proves that the address is theirs.
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      await acceptInvitations(user);
    },
  },
  emailVerification: {
    // Also accounts from before mails were sent verify their address this way.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    afterEmailVerification: async (user) => acceptInvitations(user),
  },
  plugins: [
    emailOTP({
      // Sends codes instead of the links of better-auth.
      overrideDefaultEmailVerification: true,
      expiresIn: 10 * 60,
      storeOTP: 'hashed',
      disableSignUp: true,
      changeEmail: { enabled: true },
      sendVerificationOTP: async ({ email, otp }, ctx) =>
        sendCodeMail(email, otp, ctx?.context.session?.user),
    }),
  ],
  databaseHooks: {
    user: {
      update: {
        // Set at registration, see register.tsx.
        before: async ({ email }) => (email ? { data: { name: email } } : undefined),
      },
    },
  },
  user: {
    additionalFields: {
      language: {
        type: 'string',
        required: false,
        defaultValue: 'de',
        validator: { input: z.enum(LANGUAGES) },
      },
    },
  },
  disabledPaths: [
    // Only called through auth.api by the profile page, which asks for the password first.
    '/update-user',
    '/verify-password',
    // Addresses are verified with a code, see routes/auth/verifyEmail.ts.
    '/send-verification-email',
    '/verify-email',
    // Only called through auth.api, limited per address. The others are not used.
    '/email-otp/send-verification-otp',
    '/email-otp/check-verification-otp',
    '/email-otp/verify-email',
    '/email-otp/request-password-reset',
    '/email-otp/reset-password',
    '/email-otp/request-email-change',
    '/email-otp/change-email',
    '/forget-password/email-otp',
    '/sign-in/email-otp',
  ],
  // Proxies append to X-Forwarded-For, so clients could choose a part of it.
  advanced: { ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] } },
  rateLimit: {
    enabled: true,
    storage: 'memory',
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 10 },
      '/change-password': { window: 60, max: 10 },
      '/request-password-reset': { window: 60, max: 5 },
      '/reset-password': { window: 60, max: 10 },
    },
  },
});

export type User = typeof auth.$Infer.Session.user;

/**
 * Calls a better-auth endpoint on behalf of a form. Going through the handler instead of auth.api
 * keeps rate limiting on.
 */
export function callAuth(request: Request, path: string, body: Record<string, unknown>) {
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: APP_ORIGIN });
  for (const name of ['cookie', 'user-agent', CLIENT_ADDRESS_HEADER]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return auth.handler(
    new Request(new URL(`/api/auth${path}`, env.APP_URL), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

/** The cookies of a better-auth response, to pass on with a redirect or data(). */
export function authCookies(response: { headers: Headers }): Headers {
  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
  return headers;
}

/** The signed-in user. Only for routes behind authMiddleware. */
export function getUser(context: Context): User {
  const user = context.get(userContext);
  if (!user) throw redirect('/login');
  return user;
}
