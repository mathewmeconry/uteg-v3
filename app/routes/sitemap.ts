import { APP_ORIGIN } from '~/lib/env.server';
import { LANGUAGES } from '~/locales';

export function loader() {
  const urls = LANGUAGES.map((code) => `<url><loc>${APP_ORIGIN}/${code}</loc></url>`);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
