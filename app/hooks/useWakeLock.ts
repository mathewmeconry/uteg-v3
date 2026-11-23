import { useEffect } from 'react';

/** Keeps the screen on while the page is visible. Browsers without support and plain http skip it. */
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let disposed = false;

    async function request() {
      if (document.visibilityState !== 'visible') return;
      try {
        const granted = await navigator.wakeLock.request('screen');
        if (disposed) void granted.release();
        else lock = granted;
      } catch {
        // Refused, e.g. on a low battery.
      }
    }

    // The browser releases the lock when the page is hidden.
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, []);
}
