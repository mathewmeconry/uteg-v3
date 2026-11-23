import { createInstance, type i18n } from 'i18next';
import { resources, type Language } from '~/locales';

/**
 * A new instance per request on the server, so requests never share a language, and one for the
 * lifetime of the page in the browser. Resources are bundled, so it is ready synchronously.
 */
export function createI18n(language: Language): i18n {
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: 'de',
    resources,
    defaultNS: 'common',
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}
