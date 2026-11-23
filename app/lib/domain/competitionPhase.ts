type Counts = {
  starters: number;
  divisions: { PENDING: number; RUNNING: number; ENDED: number };
};

/** What is to be done next, or is going on. */
export type Phase = 'starters' | 'divisions' | 'start' | 'running' | 'continue' | 'ended';

export function getPhase({ starters, divisions }: Counts): Phase {
  const { PENDING, RUNNING, ENDED } = divisions;
  if (RUNNING > 0) return 'running';
  if (starters === 0) return 'starters';
  if (PENDING + ENDED === 0) return 'divisions';
  if (ENDED === 0) return 'start';
  return PENDING > 0 ? 'continue' : 'ended';
}

/** Competition dates are plain days stored at midnight UTC, today is the day in Switzerland. */
export function getTiming({ startDate, endDate }: { startDate: Date; endDate: Date }, now: Date) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(now);
  if (endDate.toISOString().slice(0, 10) < today) return 'past';
  return startDate.toISOString().slice(0, 10) > today ? 'upcoming' : 'today';
}
