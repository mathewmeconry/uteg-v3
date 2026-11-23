import { useSyncExternalStore } from 'react';

// Also tablets in portrait, their pages need the width.
const QUERY = '(max-width: 1023px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Used by components/ui/sidebar, which expects this file name. */
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
