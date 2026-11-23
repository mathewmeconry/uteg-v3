import { useEffect, useState } from 'react';
import { useRevalidator } from 'react-router';

export type ConnectionStatus = 'connecting' | 'open' | 'lost';

const DEBOUNCE_MS = 200;
const RETRY_MS = 5_000;
const POLL_MS = 60_000;

/**
 * Re-runs the loaders of the page when the server reports a change on the event stream `url`,
 * after a reconnect, when the page becomes visible, and once a minute in case events got lost.
 */
export function useLiveUpdates(url: string): ConnectionStatus {
  const { revalidate } = useRevalidator();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    let source: EventSource;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    function refresh() {
      clearTimeout(debounce);
      debounce = setTimeout(() => void revalidate(), DEBOUNCE_MS);
    }

    // A failing loader would replace the page, and what was typed on it, with the error page.
    async function refreshIfReachable() {
      try {
        const response = await fetch('/healthz', { cache: 'no-store' });
        if (response.ok && !disposed) refresh();
      } catch {
        // Offline. The next attempt or the reconnect catches up.
      }
    }

    function connect() {
      source = new EventSource(url);
      source.onopen = () => {
        setStatus('open');
        // Changes between the last load and now were not reported.
        refresh();
      };
      source.onmessage = refresh;
      source.onerror = () => {
        setStatus('lost');
        // The browser only reconnects by itself after network failures, not after an error response.
        if (source.readyState === EventSource.CLOSED) retry = setTimeout(reconnect, RETRY_MS);
      };
    }

    async function reconnect() {
      // After an error response the page itself may no longer be accessible, e.g. a reset link.
      await refreshIfReachable();
      if (!disposed) connect();
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void refreshIfReachable();
    }

    connect();
    document.addEventListener('visibilitychange', onVisibilityChange);
    const poll = setInterval(() => void refreshIfReachable(), POLL_MS);

    return () => {
      disposed = true;
      source.close();
      clearTimeout(debounce);
      clearTimeout(retry);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [url, revalidate]);

  return status;
}
