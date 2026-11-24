import { isLanguage, type Language } from '~/locales';

/** The language chosen for PDFs and lists, or null for the one of the app. */
export function readDocumentLanguage(cookies: string | null): Language | null {
  const value = /(?:^|; )documentLanguage=(\w+)/.exec(cookies ?? '')?.[1];
  return isLanguage(value) ? value : null;
}

/** Remembers it on this device for a year. A cookie, so every export has it. */
export function setDocumentLanguage(language: Language) {
  document.cookie = `documentLanguage=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
