import { useTranslation } from 'react-i18next';
import { data, isRouteErrorResponse } from 'react-router';

/** Why an action could not answer. */
type Failure = { failed: 'network' | 'notFound' | 'forbidden' | 'server' };

/**
 * For client actions: an unreachable server or a missing record becomes a result. Otherwise it
 * would replace the page, and what was typed on it, with the error page.
 */
export async function keepPage<Result>(serverAction: () => Promise<Result>) {
  try {
    return await serverAction();
  } catch (error) {
    // Redirects, e.g. to the login page.
    if (error instanceof Response) throw error;
    // With an error status React Router does not load the page again, which would fail as well.
    return data<Failure>({ failed: getFailure(error) }, 500);
  }
}

function getFailure(error: unknown): Failure['failed'] {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return 'notFound';
    return error.status === 403 ? 'forbidden' : 'server';
  }
  return error instanceof TypeError ? 'network' : 'server';
}

/** The message of a failed action, or of an action that returned one as `error`. */
export function useActionError(result: object | undefined) {
  const { t } = useTranslation('starters');
  if (!result) return undefined;
  if ('failed' in result && result.failed) return t(`failed.${(result as Failure).failed}`);
  return 'error' in result ? String(result.error) : undefined;
}
