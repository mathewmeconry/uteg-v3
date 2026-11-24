import type { listDivisions } from '~/lib/divisions.server';

export type Division = Awaited<ReturnType<typeof listDivisions>>[number];

export const FILTER_KEYS = ['category', 'sex', 'ground', 'state'] as const;
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

const STATE_ORDER = ['ENDED', 'RUNNING', 'PENDING'];

/** The order of a ground: what has ended, what is running, and what is due next. */
export function inRunningOrder(divisions: readonly Division[]) {
  return divisions.toSorted(
    (a, b) =>
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      (a.state === 'ENDED' ? Number(a.endedAt) - Number(b.endedAt) : 0) ||
      a.position - b.position ||
      Number(a.createdAt) - Number(b.createdAt),
  );
}

export type DivisionMove = { id: string; ground: number; beforeId?: string };

/** What `moveDivision` does, to show it before the server has answered. */
export function applyMove(divisions: readonly Division[], { id, ground, beforeId }: DivisionMove) {
  const others = divisions.filter((division) => division.id !== id);
  const onGround = others
    .filter((division) => division.ground === ground)
    .toSorted((a, b) => a.position - b.position || Number(a.createdAt) - Number(b.createdAt));
  const before = onGround.findIndex((division) => division.id === beforeId);
  // Between two positions.
  const position =
    before < 0 ? (onGround.at(-1)?.position ?? 0) + 1 : onGround[before].position - 0.5;
  return divisions.map((division) =>
    division.id === id ? { ...division, ground, position } : division,
  );
}

/** One place up or down among the planned ones of the ground, which are in running order. */
export function stepMove(
  planned: readonly Division[],
  id: string,
  step: -1 | 1,
): DivisionMove | null {
  const index = planned.findIndex((division) => division.id === id);
  const target = index + step;
  if (index < 0 || target < 0 || target >= planned.length) return null;
  const beforeId = planned[step < 0 ? target : target + 1]?.id;
  return { id, ground: planned[index].ground, beforeId };
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
