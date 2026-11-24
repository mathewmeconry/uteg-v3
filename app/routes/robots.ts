import { APP_ORIGIN } from '~/lib/env.server';

/** Everything may be read: what must not be found says so itself, see securityHeadersMiddleware. */
export function loader() {
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${APP_ORIGIN}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
