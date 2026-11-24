import { logger } from '~/lib/logger.server';
import { sendMail } from '~/lib/mail.server';
import { APP_URL, createMail } from '~/lib/mailTemplate.server';
import { prisma } from '~/lib/prisma.server';
import { createRateLimit } from '~/lib/rateLimit.server';
import { isLanguage, type Language } from '~/locales';

type Recipient = { email: string; language?: unknown };

// Per address, which anyone can register with to send it mails.
const maySendCode = createRateLimit({ windowMs: 60 * 60_000, max: 10 });
const maySendReset = createRateLimit({ windowMs: 60 * 60_000, max: 5 });
const maySendExisting = createRateLimit({ windowMs: 60 * 60_000, max: 5 });

/** `user` is who changes the address, otherwise it is the one with the address. */
export async function sendCodeMail(email: string, code: string, user?: Record<string, unknown>) {
  if (!maySendCode(email)) return;
  const language = (user ?? (await prisma.user.findUnique({ where: { email } })))?.language;
  sendInBackground({ email, language }, (language) => createMail('code', language, { code }));
}

export function sendResetMail(user: Recipient, token: string) {
  if (!maySendReset(user.email)) return;
  const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  sendInBackground(user, (language) => createMail('reset', language, { url }));
}

/** Someone tried to register with an address that has an account. */
export function sendExistingAccountMail(user: Recipient) {
  if (!maySendExisting(user.email)) return;
  const url = `${APP_URL}/forgot-password`;
  sendInBackground(user, (language) => createMail('existing', language, { url }));
}

/** Not awaited, the time an answer takes would tell whether an address has an account. */
function sendInBackground(
  { email, language }: Recipient,
  create: (language: Language) => ReturnType<typeof createMail>,
) {
  create(isLanguage(language) ? language : 'de')
    .then((mail) => sendMail({ to: email, ...mail }))
    .catch((error) => logger.error(error, 'Mail could not be sent'));
}
