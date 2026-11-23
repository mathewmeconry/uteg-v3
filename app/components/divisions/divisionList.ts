import type { listDivisions } from '~/lib/divisions.server';

export type Division = Awaited<ReturnType<typeof listDivisions>>[number];

export const FILTER_KEYS = ['category', 'sex', 'ground', 'state'] as const;
export const SORT_KEYS = ['category', 'number', 'sex', 'ground', 'state', 'starters'] as const;

/** The filters are in the URL, so they survive a reload and the way back from the lineups. */
export function filterDivisions(divisions: readonly Division[], params: URLSearchParams) {
  return divisions.filter((division) =>
    FILTER_KEYS.every((key) => {
      const value = params.get(key);
      return !value || String(division[key]) === value;
    }),
  );
}

/** Every word of the search has to be in the text. */
export function matchesSearch(text: string, search: string) {
  const words = search.toLowerCase().split(/\s+/);
  return words.every((word) => text.toLowerCase().includes(word));
}

const STATE_ORDER = ['RUNNING', 'PENDING', 'ENDED'];

/** The server sorts by category, sex and number, which is kept within the same ground or state. */
export function sortDivisions(divisions: readonly Division[], key: string | null) {
  switch (key) {
    case 'number':
      return divisions.toSorted((a, b) => a.number - b.number);
    case 'sex':
      return divisions.toSorted((a, b) => Number(a.sex === 'MALE') - Number(b.sex === 'MALE'));
    case 'ground':
      return divisions.toSorted((a, b) => a.ground - b.ground);
    case 'state':
      return divisions.toSorted(
        (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state),
      );
    case 'starters':
      return divisions.toSorted((a, b) => b.starterCount - a.starterCount);
    default:
      return [...divisions];
  }
}

/** What to point out before these divisions start. `running` are the running ones of all contests. */
export function getStartWarnings(divisions: readonly Division[], running: readonly Division[]) {
  return {
    ended: divisions.filter(({ state }) => state === 'ENDED'),
    /** Stopped before they ended. */
    progress: divisions.filter((division) => division.state !== 'ENDED' && hasProgress(division)),
    unassigned: divisions.filter(({ unassignedCount }) => unassignedCount > 0),
    /** Past the first round on some apparatus: the new divisions have to catch up with them. */
    behind: running.filter(
      (division) =>
        hasProgress(division) && divisions.some(({ ground }) => ground === division.ground),
    ),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasProgress({ progress }: Division) {
  return Object.values(progress).some((completedRounds) => completedRounds > 0);
}
