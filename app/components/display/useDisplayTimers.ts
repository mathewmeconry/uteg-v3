import { useEffect, useState } from 'react';
import { advance, showAll } from './displayState';

/** What the display shows of the live data, so that every grade can be read. */
export function useShown(live: Parameters<typeof advance>[1]) {
  const [shown, setShown] = useState(() => showAll(live, Date.now()));

  useEffect(() => {
    const update = () => setShown((current) => advance(current, live, Date.now()));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [live]);

  return shown;
}

/** Whether `hidesInMs` has passed since it was loaded, also without a connection. */
export function useIsExpired(hidesInMs: number | null) {
  const [expired, setExpired] = useState<number | null>(null);

  useEffect(() => {
    if (hidesInMs === null) return;
    const timer = setTimeout(() => setExpired(hidesInMs), hidesInMs);
    return () => clearTimeout(timer);
  }, [hidesInMs]);

  return hidesInMs !== null && expired === hidesInMs;
}
