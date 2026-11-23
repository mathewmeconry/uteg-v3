import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { redirect } from 'react-router';
import { z } from 'zod';
import { userContext, type Context } from '~/context';
import { APP_ORIGIN, env } from '~/lib/env.server';
import { prisma } from '~/lib/prisma.server';
import { LANGUAGES } from '~/locales';

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
  user: {
    additionalFields: {
      language: {
        type: 'string',
        required: false,
        defaultValue: 'de',
        validator: { input: z.enum(LANGUAGES) },
      },
    },
    // The app sends no mails, so addresses are never verified.
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
  },
  // Only called through auth.api by the profile page, which asks for the password first.
  disabledPaths: ['/change-email', '/update-user', '/verify-password'],
  rateLimit: {
    enabled: true,
    storage: 'memory',
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 10 },
      '/change-password': { window: 60, max: 10 },
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
  for (const name of ['cookie', 'user-agent', 'x-forwarded-for']) {
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
