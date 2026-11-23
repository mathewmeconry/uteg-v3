import { UnlinkIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { EmptyState } from './EmptyState';
import { ErrorPage } from './ErrorPage';

const RETRY_MS = 5_000;

/** Error page of judges and displays. Nobody sits next to a display, so it recovers by itself. */
export function TokenErrorBoundary() {
  const { t } = useTranslation('judging');
  const error = useRouteError();
  const isInvalidLink = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (isInvalidLink) return;
    const timer = setInterval(() => {
      fetch('/healthz', { cache: 'no-store' }).then(
        (response) => response.ok && window.location.reload(),
        () => {
          // Still offline.
        },
      );
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [isInvalidLink]);

  if (!isInvalidLink) return <ErrorPage status={500} />;
  return (
    <main className="p-6">
      <EmptyState icon={UnlinkIcon} title={t('linkInvalidTitle')} text={t('linkInvalidText')} />
    </main>
  );
}
