import { isAPIError } from 'better-auth/api';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { data, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/verifyEmail';
import { auth, authCookies, callAuth } from '~/lib/auth/auth.server';
import { safeRedirect } from '~/lib/auth/redirect';
import { parseForm } from '~/lib/forms.server';
import { prisma } from '~/lib/prisma.server';
import { createRateLimit } from '~/lib/rateLimit.server';
import { getT } from '~/middlewares/i18n.server';

export function loader() {
  return redirect('/login');
}

/** The form of VerifyForm. */
export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const formData = await request.formData();
  const { data: values } = parseForm(
    formData,
    z.object({
      email: z.string().trim().toLowerCase().pipe(z.email()),
      password: z.string().max(128),
      code: z.string().trim().default(''),
    }),
  );
  if (!values) throw data(null, 400);
  const { email, password, code } = values;

  if (formData.get('intent') === 'resend') {
    // Sends a code if the password is right and the address not verified.
    const { status } = await callAuth(request, '/sign-in/email', { email, password });
    if (status === 429) return data({ error: t('errors.tooManyRequests') }, 429);
    return data({ sent: true });
  }

  const tooMany = data({ errors: { code: t('errors.tooManyRequests') } }, 429);
  const invalid = data({ errors: { code: t('auth:verify.invalid') } }, 400);
  if (!mayCheckPassword(request.headers.get('x-forwarded-for') ?? '')) return tooMany;
  // Otherwise a code would confirm the account, and the password, of somebody who registered with
  // this address before.
  if (!(await checkPassword(email, password))) return invalid;
  // Only counts who knows the password, so others can't use up the attempts.
  if (!mayTryCode(email)) return tooMany;
  let headers;
  try {
    ({ headers } = await auth.api.verifyEmailOTP({
      body: { email, otp: code },
      headers: request.headers,
      returnHeaders: true,
    }));
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return invalid;
  }
  return redirect(safeRedirect(formData.get('redirectTo')), { headers: authCookies({ headers }) });
}

const mayCheckPassword = createRateLimit({ windowMs: 60_000, max: 10 });
// Per address: better-auth allows three attempts per code, but any number of codes.
const mayTryCode = createRateLimit({ windowMs: 60 * 60_000, max: 20 });

async function checkPassword(email: string, password: string) {
  const account = await prisma.account.findFirst({
    where: { user: { email }, providerId: 'credential' },
  });
  if (account?.password) return verifyPassword({ hash: account.password, password });
  // Takes as long as if there was an account.
  await hashPassword(password);
  return false;
}
