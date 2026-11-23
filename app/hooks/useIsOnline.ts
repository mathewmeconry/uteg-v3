import { useSyncExternalStore } from 'react';

/** What the browser knows about the network. An event stream notices much later that it is gone. */
export function useIsOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}
