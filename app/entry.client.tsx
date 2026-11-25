import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { isRouteErrorResponse } from 'react-router';
import { HydratedRouter } from 'react-router/dom';
import { createI18n } from '~/lib/i18n';
import { isLanguage } from '~/locales';

declare global {
  interface Window {
    /** Missing until the script in root.tsx has loaded, or when it is blocked. */
    umami?: { captureException: (error: unknown) => void };
  }
}

// The language the server rendered with.
const { lang } = document.documentElement;
const i18n = createI18n(isLanguage(lang) ? lang : 'de');

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <HydratedRouter onError={captureError} />
      </I18nextProvider>
    </StrictMode>,
  );
});

/** Error boundaries catch these before Umami sees them. Responses like 404 are no bugs. */
function captureError(error: unknown) {
  if (!isRouteErrorResponse(error)) window.umami?.captureException(error);
}
