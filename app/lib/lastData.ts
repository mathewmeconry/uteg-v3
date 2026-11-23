import { isRouteErrorResponse } from 'react-router';

const TIMEOUT_MS = 10_000;

/**
 * For the client loaders of judges and displays: when the data cannot be loaded, the last one is
 * kept instead of showing an error page. A denied access still ends the session.
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
      if (isDenied(error)) last = null;
      if (last?.key !== key) throw error;
      return last.data;
    } finally {
      clearTimeout(timer);
    }
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The loaders throw data(null, 403). The answer of a proxy has a text instead of null. */
function isDenied(error: unknown) {
  return isRouteErrorResponse(error) && error.status === 403 && error.data === null;
}
