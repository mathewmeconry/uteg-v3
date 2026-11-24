import { auth, authCookies } from '~/lib/auth/auth.server';
import { prisma } from '~/lib/prisma.server';

/** A signed-in user with a verified address, and the cookie of the session. */
export async function signUp(body: { email: string; password: string; language?: string }) {
  await auth.api.signUpEmail({ body: { ...body, name: body.email } });
  await prisma.user.update({ where: { email: body.email }, data: { emailVerified: true } });
  const { headers, response } = await auth.api.signInEmail({ body, returnHeaders: true });
  const cookie = authCookies({ headers })
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { user: response.user, cookie };
}
