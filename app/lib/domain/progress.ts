type ApparatusProgress = { completedRounds: number };

/** A division is as far as its slowest apparatus. */
export function getCurrentRound(progress: readonly ApparatusProgress[]) {
  if (progress.length === 0) return 0;
  return Math.min(...progress.map(({ completedRounds }) => completedRounds));
}

/** `progress` has one row per apparatus, which is also the number of rounds. */
export function isEnded(progress: readonly ApparatusProgress[]) {
  return progress.length > 0 && getCurrentRound(progress) >= progress.length;
}
