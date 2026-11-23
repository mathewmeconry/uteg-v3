/** The part of the judging state these functions need. */
type Slot = {
  entryId: string;
  firstname: string;
  lastname: string;
  withdrawn: boolean;
};

export type TabletState = {
  status: 'WAITING' | 'JUDGING' | 'FINISHED';
  currentRound: number | null;
  divisions: { id: string; category: string; sex: 'FEMALE' | 'MALE'; number: number }[];
  endedIds: string[];
  rounds: { round: number; slots: Slot[] }[];
};

type DivisionName = Omit<TabletState['divisions'][number], 'id'>;

export type Notice =
  | { kind: 'added' | 'withdrawn' | 'removed' | 'restored'; id: string; name: string }
  | { kind: 'started' | 'stopped'; id: string; division: DivisionName };

/** What judges have to be told about a change while they judge. */
export function getNotices(before: TabletState, after: TabletState): Notice[] {
  const notices: Notice[] = [];

  if (before.status === 'JUDGING') {
    for (const division of after.divisions) {
      if (!before.divisions.some(({ id }) => id === division.id)) {
        notices.push({ kind: 'started', id: `${division.id}:started`, division });
      }
    }
    for (const division of before.divisions) {
      if (after.divisions.some(({ id }) => id === division.id)) continue;
      if (after.endedIds.includes(division.id)) continue;
      notices.push({ kind: 'stopped', id: `${division.id}:stopped`, division });
    }
  }
  if (before.status !== 'JUDGING' || after.status !== 'JUDGING') return notices;

  const slotsBefore = byEntry(before);
  const slotsAfter = byEntry(after);
  const add = (kind: 'added' | 'withdrawn' | 'removed' | 'restored', slot: Slot) =>
    notices.push({
      kind,
      id: `${slot.entryId}:${kind}`,
      name: `${slot.firstname} ${slot.lastname}`,
    });

  // Otherwise whole divisions come and go from the lists, see getJudgingState.
  const isComparable =
    before.currentRound === after.currentRound &&
    before.divisions.map(({ id }) => id).join() === after.divisions.map(({ id }) => id).join();

  for (const [entryId, slot] of slotsAfter) {
    const old = slotsBefore.get(entryId);
    if (!old) {
      if (isComparable) add(slot.withdrawn ? 'withdrawn' : 'added', slot);
    } else if (old.withdrawn !== slot.withdrawn) {
      add(slot.withdrawn ? 'withdrawn' : 'restored', slot);
    }
  }
  for (const [entryId, slot] of slotsBefore) {
    if (isComparable && !slotsAfter.has(entryId)) add('removed', slot);
  }
  return notices;
}

/** Adds notices and drops the ones they contradict, e.g. "added" after "removed". */
export function mergeNotices(notices: readonly Notice[], added: readonly Notice[]): Notice[] {
  const subject = ({ id }: Notice) => id.slice(0, id.lastIndexOf(':'));
  const replaced = new Set(added.map(subject));
  return [...notices.filter((notice) => !replaced.has(subject(notice))), ...added];
}

/** Whether the tablet waits because what it judged has ended. */
export function hasJustEnded(before: TabletState, after: TabletState) {
  return (
    after.status === 'WAITING' && before.divisions.some(({ id }) => after.endedIds.includes(id))
  );
}

/** 'review' or the entry that is being judged. */
export type Position = { round: number; view: 'review' | string; fromReview: boolean };

/**
 * Where the judge is in the round. Stays as long as it makes sense, otherwise continues with the
 * first starter without a grade.
 */
export function resolvePosition(
  position: Position | null,
  round: number,
  slots: readonly { entryId: string; withdrawn: boolean }[],
  isDone: (entryId: string) => boolean,
): Position {
  if (
    position?.round === round &&
    (position.view === 'review' || slots.some(({ entryId }) => entryId === position.view))
  ) {
    return position;
  }
  const open = slots.find(({ entryId, withdrawn }) => !withdrawn && !isDone(entryId));
  return { round, view: open?.entryId ?? 'review', fromReview: false };
}

/** The next or previous starter who still takes part. */
export function findNeighbour<Item extends { entryId: string; withdrawn: boolean }>(
  slots: readonly Item[],
  entryId: string,
  direction: 1 | -1,
): Item | null {
  const index = slots.findIndex((slot) => slot.entryId === entryId);
  if (index === -1) return null;
  const rest = direction === 1 ? slots.slice(index + 1) : slots.slice(0, index).toReversed();
  return rest.find(({ withdrawn }) => !withdrawn) ?? null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function byEntry(state: TabletState) {
  return new Map(
    state.rounds.flatMap(({ slots }) => slots).map((slot) => [slot.entryId, slot] as const),
  );
}
