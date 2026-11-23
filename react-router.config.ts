import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  // Otherwise the first submit on a page asks the server for its routes. Without a connection that
  // replaces the page, and what was typed on it, with the error page.
  routeDiscovery: { mode: 'initial' },
  // React Router compares Origin with the request URL, which is http:// behind a TLS proxy.
  // middlewares/origin.server.ts compares it with APP_URL instead.
  allowedActionOrigins: ['**'],
} satisfies Config;
