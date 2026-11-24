import { config } from 'dotenv';
import { z } from 'zod';

config({ quiet: true });

export const env = z
  .object({
    APP_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().optional(),
  })
  .refine(({ RESEND_API_KEY }) => RESEND_API_KEY || process.env.NODE_ENV !== 'production', {
    path: ['RESEND_API_KEY'],
    message: 'Required in production, accounts must be verified by mail',
  })
  .refine(({ RESEND_API_KEY, MAIL_FROM }) => !RESEND_API_KEY || MAIL_FROM, {
    path: ['MAIL_FROM'],
    message: 'Required to send mails',
  })
  .parse(process.env);

/** Scheme, host and port of APP_URL, as browsers send it in the Origin header. */
export const APP_ORIGIN = new URL(env.APP_URL).origin;
