import { isRouteErrorResponse } from 'react-router';

/** Thrown with status 404 by the loaders of judges and displays. */
export const INVALID_LINK = 'INVALID_LINK';

const TIMEOUT_MS = 10_000;

/**
 * For the client loaders of judges and displays: when the data cannot be loaded, the last one is
 * kept instead of showing an error page. A reset link still ends the session, also if it was
 * answered by this app and not by a proxy while it restarts.
 */
export function createLastData<Data>() {
  let last: { key: string; data: Data } | null = null;

  return async function load(key: string, loadData: () => Promise<Data>): Promise<Data> {
    let timer;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
    });
    try {
      const data = await Promise.race([loadData(), timeout]);
      last = { key, data };
      return data;
    } catch (error) {
      const isInvalidLink = isRouteErrorResponse(error) && error.data === INVALID_LINK;
      if (isInvalidLink || last?.key !== key) throw error;
      return last.data;
    } finally {
      clearTimeout(timer);
    }
  };
}
