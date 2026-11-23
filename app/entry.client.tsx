import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HydratedRouter } from 'react-router/dom';
import { createI18n } from '~/lib/i18n';
import { isLanguage } from '~/locales';

// The language the server rendered with.
const { lang } = document.documentElement;
const i18n = createI18n(isLanguage(lang) ? lang : 'de');

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <HydratedRouter />
      </I18nextProvider>
    </StrictMode>,
  );
});
