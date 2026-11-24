import { env } from '~/lib/env.server';
import { createI18n } from '~/lib/i18n';
import { logger } from '~/lib/logger.server';
import { sendMail } from '~/lib/mail.server';
import { prisma } from '~/lib/prisma.server';
import { createRateLimit } from '~/lib/rateLimit.server';
import { isLanguage } from '~/locales';

type Recipient = { email: string; language?: unknown };

const APP_URL = env.APP_URL.replace(/\/$/, '');

// Per address, which anyone can register with to send it mails.
const maySendCode = createRateLimit({ windowMs: 60 * 60_000, max: 10 });

/** `user` is who changes the address, otherwise it is the one with the address. */
export async function sendCodeMail(email: string, code: string, user?: Record<string, unknown>) {
  if (!maySendCode(email)) return;
  const language = (user ?? (await prisma.user.findUnique({ where: { email } })))?.language;
  sendInBackground({ email, language }, 'code', { code });
}

export function sendResetMail(user: Recipient, token: string) {
  const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  sendInBackground(user, 'reset', { url });
}

/** Someone tried to register with an address that has an account. */
export function sendExistingAccountMail(user: Recipient) {
  sendInBackground(user, 'existing', { url: `${APP_URL}/forgot-password` });
}

/** Not awaited, the time an answer takes would tell whether an address has an account. */
function sendInBackground(
  { email, language }: Recipient,
  mail: 'code' | 'reset' | 'existing',
  values: { url?: string; code?: string },
) {
  const { t } = createI18n(isLanguage(language) ? language : 'de');
  sendMail({
    to: email,
    subject: t(`mails:${mail}.subject`, values),
    text: t(`mails:${mail}.text`, values),
  }).catch((error) => logger.error(error, 'Mail could not be sent'));
}
