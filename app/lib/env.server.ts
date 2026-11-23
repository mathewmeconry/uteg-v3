import { config } from 'dotenv';
import { z } from 'zod';

config({ quiet: true });

export const env = z
  .object({
    APP_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
  })
  .parse(process.env);

/** Scheme, host and port of APP_URL, as browsers send it in the Origin header. */
export const APP_ORIGIN = new URL(env.APP_URL).origin;
