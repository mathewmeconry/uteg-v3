import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { readDocumentLanguage, setDocumentLanguage } from '~/lib/documentLanguage';
import type { Language } from '~/locales';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // It may have been changed in another tab.
  window.addEventListener('focus', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('focus', listener);
  };
}

/** The language of exported documents, by default the one of the app. */
export function useDocumentLanguage() {
  const { i18n } = useTranslation();
  const chosen = useSyncExternalStore(
    subscribe,
    () => readDocumentLanguage(document.cookie),
    () => null,
  );

  function choose(language: Language) {
    setDocumentLanguage(language);
    for (const listener of listeners) listener();
  }

  return [chosen ?? (i18n.language as Language), choose] as const;
}
