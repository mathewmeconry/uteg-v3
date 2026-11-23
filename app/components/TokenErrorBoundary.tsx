import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { AccessGate } from './AccessGate';
import { ErrorPage } from './ErrorPage';

const RETRY_MS = 5_000;

/** Error page of judges and displays. Nobody sits next to a display, so it recovers by itself. */
export function TokenErrorBoundary() {
  const error = useRouteError();
  const isDenied = isRouteErrorResponse(error) && error.status === 403;

  useEffect(() => {
    if (isDenied) return;
    const timer = setInterval(() => {
      fetch('/healthz', { cache: 'no-store' }).then(
        (response) => response.ok && window.location.reload(),
        () => {
          // Still offline.
        },
      );
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [isDenied]);

  return isDenied ? <AccessGate /> : <ErrorPage status={500} />;
}
