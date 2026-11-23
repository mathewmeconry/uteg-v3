import type { JudgingSlot, JudgingState } from '~/lib/judging.server';

/** A starter on the tablet. The apparatus is the one of the tablet. */
export type TabletSlot = JudgingSlot & { apparatus: string };
export type TabletRound = { round: number; slots: TabletSlot[] };
export type DivisionSummary = JudgingState['divisions'][number];

export function fullName({ firstname, lastname }: { firstname: string; lastname: string }) {
  return `${firstname} ${lastname}`;
}
