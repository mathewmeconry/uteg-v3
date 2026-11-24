import { setTimeout } from 'node:timers/promises';
import { env } from './env.server';
import { logger } from './logger.server';

type Mail = { to: string; subject: string; text: string };

/** Sends a mail with Resend. Without an API key, which production requires, it is only logged. */
export async function sendMail({ to, subject, text }: Mail) {
  if (!env.RESEND_API_KEY) {
    logger.info(`Mail not sent, RESEND_API_KEY is not set.\n${subject}\n\n${text}`);
    return;
  }
  const send = () =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
  let response = await send();
  // Resend only takes a few requests per second, the wizard may invite more.
  if (response.status === 429) {
    await setTimeout(1500);
    response = await send();
  }
  if (!response.ok) {
    // The message may contain the address.
    const { name } = await response.json().catch(() => ({}));
    throw new Error(`Resend answered ${response.status} ${name ?? ''}`);
  }
}
