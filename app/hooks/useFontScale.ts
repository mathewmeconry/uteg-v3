import { useCallback, useSyncExternalStore } from 'react';

export const FONT_SCALES = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
const DEFAULT_SCALE = 1;

const listeners = new Set<() => void>();
// Used as well as the storage, which may be blocked.
const memory = new Map<string, number>();

/** The font size this device was set to, remembered under `key`. */
export function useFontScale(key: string) {
  const scale = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => DEFAULT_SCALE,
  );

  const change = useCallback(
    (step: 1 | -1) => {
      const index = FONT_SCALES.indexOf(read(key)) + step;
      const next = FONT_SCALES[Math.min(Math.max(index, 0), FONT_SCALES.length - 1)];
      memory.set(key, next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Storage blocked, the size lives as long as the page.
      }
      for (const listener of listeners) listener();
    },
    [key],
  );

  return { scale, change };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function read(key: string) {
  const known = memory.get(key);
  if (known !== undefined) return known;
  let stored = DEFAULT_SCALE;
  try {
    stored = Number(localStorage.getItem(key));
  } catch {
    // Storage blocked.
  }
  const scale = FONT_SCALES.includes(stored) ? stored : DEFAULT_SCALE;
  memory.set(key, scale);
  return scale;
}
