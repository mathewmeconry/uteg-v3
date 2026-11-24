import { isAPIError } from 'better-auth/api';
import { data, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/verifyEmail';
import { auth, authCookies, mayTryCode } from '~/lib/auth/auth.server';
import { safeRedirect } from '~/lib/auth/redirect';
import { parseForm } from '~/lib/forms.server';
import { prisma } from '~/lib/prisma.server';
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
      code: z.string().trim().default(''),
    }),
  );
  if (!values) throw data(null, 400);
  const { email, code } = values;

  if (formData.get('intent') === 'resend') {
    const user = await prisma.user.findUnique({ where: { email } });
    // The answer is the same, it must not tell whether there is an account.
    if (user && !user.emailVerified) {
      await auth.api.sendVerificationOTP({ body: { email, type: 'email-verification' } });
    }
    return data({ sent: true });
  }

  if (!mayTryCode(email)) return data({ errors: { code: t('errors.tooManyRequests') } }, 429);
  let headers;
  try {
    ({ headers } = await auth.api.verifyEmailOTP({
      body: { email, otp: code },
      headers: request.headers,
      returnHeaders: true,
    }));
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return data({ errors: { code: t('auth:verify.invalid') } }, 400);
  }
  return redirect(safeRedirect(formData.get('redirectTo')), { headers: authCookies({ headers }) });
}
