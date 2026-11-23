import { useEffect, useState } from 'react';

const ROUND_DELAY_MS = 30_000;

/**
 * The round to show: stays on the previous one for 30 seconds, so the last grades can be read. The
 * first round of other divisions and the round after a reload are shown at once.
 */
export function useDelayedRound(round: number, divisionIds: readonly string[]) {
  const [shown, setShown] = useState({ round, divisionIds, isOver: false });
  const isSameCompetitors = divisionIds.some((id) => shown.divisionIds.includes(id));
  const isDelayed = isSameCompetitors && round > shown.round && !shown.isOver;

  const isCurrent =
    round === shown.round && divisionIds.join() === shown.divisionIds.join() && !shown.isOver;
  if (!isDelayed && !isCurrent) setShown({ round, divisionIds, isOver: false });

  useEffect(() => {
    if (!isDelayed) return;
    const timer = setTimeout(
      () => setShown((state) => ({ ...state, isOver: true })),
      ROUND_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [isDelayed]);

  return isDelayed ? shown.round : round;
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
