import { createCookie, type MiddlewareFunction } from 'react-router';
import type { i18n } from 'i18next';
import { i18nContext, languageContext, userContext, type Context } from '~/context';
import { createI18n } from '~/lib/i18n';
import { isLanguage, NAMESPACES, type Language, type ServerT } from '~/locales';

/** Remembers the language for visitors that are not signed in. */
export const languageCookie = createCookie('language', {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 365,
});

/** The language of the browser. */
export function acceptedLanguage(header: string | null): Language {
  const codes = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag, quality] = part.trim().split(';q=');
      return { code: tag.slice(0, 2).toLowerCase(), quality: quality ? Number(quality) : 1 };
    })
    .sort((a, b) => b.quality - a.quality)
    .map(({ code }) => code);
  return codes.find(isLanguage) ?? 'de';
}

export const i18nMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const preferred =
    context.get(userContext)?.language ??
    (await languageCookie.parse(request.headers.get('Cookie')));
  const language = isLanguage(preferred)
    ? preferred
    : acceptedLanguage(request.headers.get('Accept-Language'));

  context.set(languageContext, language);
  context.set(i18nContext, createI18n(language));
  return next();
};

export function getI18n(context: Context): i18n {
  return context.get(i18nContext) ?? createI18n('de');
}

/** t() for loaders and actions: `t('starters:title')`. */
export function getT(context: Context): ServerT {
  return getI18n(context).getFixedT(null, NAMESPACES);
}
