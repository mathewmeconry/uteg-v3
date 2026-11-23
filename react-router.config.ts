import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  // React Router compares Origin with the request URL, which is http:// behind a TLS proxy.
  // middlewares/origin.server.ts compares it with APP_URL instead.
  allowedActionOrigins: ['**'],
} satisfies Config;
