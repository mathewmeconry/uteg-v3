import { MAX_EVENT_IDS } from '~/lib/events';
import type { ContestOptions } from '~/lib/contestOptions.server';
import type { ClubOption } from './ClubCombobox';
import type { StarterRow } from './starterRow';

export type StarterData = { starters: StarterRow[]; contest: ContestOptions; clubs: ClubOption[] };
/** The answer for some starters. Those that are missing were removed. */
export type StarterChanges = Pick<StarterData, 'starters' | 'contest'>;

/**
 * The data of the starters page. While only some starters changed, just those are loaded: the whole
 * list takes seconds on a slow connection.
 */
export function createStarterUpdates() {
  let last: { key: string; data: StarterData } | null = null;
  // Counts changes, to tell those before a load from those during it.
  let clock = 0;
  const changedIds = new Map<string, number>();
  /** 0 when only the ids changed. */
  let allChangedAt = 0;
  let loads = 0;
  let newestLoaded = 0;

  function changed(ids: readonly string[]) {
    clock++;
    for (const id of ids) changedIds.set(id, clock);
  }

  return {
    /** Data that did not pass through `load`, which is the first one. */
    remember(key: string, data: StarterData) {
      if (last?.key !== key) last = { key, data };
    },

    /** The page is left, what changes from now on is not reported. */
    forget() {
      last = null;
      changedIds.clear();
      allChangedAt = 0;
    },

    changed,

    /** For useLiveUpdates. */
    note(message: string | null) {
      const [topic, ...ids] = message?.split(' ') ?? [];
      if (topic === 'grades' || topic === 'settings') return false;
      if (topic === 'starters' && ids.length > 0) changed(ids);
      else allChangedAt = ++clock;
      return true;
    },

    async load(
      key: string,
      signal: AbortSignal,
      loadAll: () => Promise<StarterData>,
      loadSome: (contestId: string, ids: string[]) => Promise<StarterChanges>,
    ) {
      const ids = new Set(changedIds.keys());
      const isPartial = !allChangedAt && ids.size > 0 && ids.size <= MAX_EVENT_IDS;
      // The load that aborts this one starts before this one fails, and has to make up for it.
      // So everything counts as changed until it is loaded.
      if (!isPartial) allChangedAt = ++clock;
      const startedAt = clock;
      const load = ++loads;

      const changes =
        isPartial && last?.key === key
          ? await loadSome(last.data.contest.id, [...ids]).catch(() => null)
          : null;
      // Without the changes, e.g. after logging out, the loader of the page has to answer.
      const data =
        changes && last?.key === key ? mergeChanges(last.data, ids, changes) : await loadAll();
      signal.throwIfAborted();
      // The load after an action is not aborted by those after it, so it may answer last.
      if (load < newestLoaded) return last?.key === key ? last.data : data;
      newestLoaded = load;
      last = { key, data };
      // What changed while loading belongs to the next time.
      for (const [id, changedAt] of changedIds) if (changedAt <= startedAt) changedIds.delete(id);
      if (!changes && allChangedAt <= startedAt) allChangedAt = 0;
      return data;
    },
  };
}

/** The one of the page in this browser. */
export const starterUpdates = createStarterUpdates();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Rows that did not change stay the same objects, so they are not rendered again. */
function mergeChanges(
  data: StarterData,
  ids: ReadonlySet<string>,
  { starters, contest }: StarterChanges,
): StarterData {
  const changed = new Map(starters.map((row) => [row.id, row]));
  const known = new Set(data.starters.map(({ id }) => id));
  const knownClubs = new Set(data.clubs.map(({ id }) => id));
  const newClubs = new Map(
    starters.filter(({ club }) => !knownClubs.has(club.id)).map(({ club }) => [club.id, club]),
  );
  return {
    starters: [
      ...data.starters.flatMap((row) => {
        if (!ids.has(row.id)) return [row];
        const current = changed.get(row.id);
        return current ? [current] : [];
      }),
      ...starters.filter(({ id }) => !known.has(id)),
    ],
    contest,
    clubs: [...data.clubs, ...newClubs.values()],
  };
}
