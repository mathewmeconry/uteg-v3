import {
  findNeighbour,
  getNotices,
  hasJustEnded,
  mergeNotices,
  resolvePosition,
  type TabletState,
} from './judgeState';

const slot = (entryId: string, withdrawn = false) => ({
  entryId,
  firstname: entryId,
  lastname: 'Frei',
  withdrawn,
});

const division = (id: string) => ({ id, category: 'K5', sex: 'FEMALE' as const, number: 1 });

function createState(patch: Partial<TabletState> = {}, entries = ['a', 'b']): TabletState {
  return {
    status: 'JUDGING',
    currentRound: 0,
    divisions: [division('d1')],
    endedIds: [],
    rounds: [
      { round: 0, slots: entries.map((id) => slot(id)) },
      { round: 1, slots: [] },
    ],
    ...patch,
  };
}

const kinds = (before: TabletState, after: TabletState) =>
  getNotices(before, after).map((notice) =>
    'name' in notice ? `${notice.kind} ${notice.name}` : `${notice.kind} ${notice.id}`,
  );

describe('getNotices', () => {
  it('reports added, removed, withdrawn and restored starters', () => {
    const state = createState();
    expect(kinds(state, state)).toEqual([]);
    expect(kinds(state, createState({}, ['a', 'b', 'c']))).toEqual(['added c Frei']);
    expect(kinds(state, createState({}, ['b']))).toEqual(['removed a Frei']);
    const withdrawn = createState({ rounds: [{ round: 0, slots: [slot('a', true), slot('b')] }] });
    expect(kinds(state, withdrawn)).toEqual(['withdrawn a Frei']);
    expect(kinds(withdrawn, state)).toEqual(['restored a Frei']);
  });

  it('stays quiet when a starter only moves to another round', () => {
    const moved = createState({
      rounds: [
        { round: 0, slots: [slot('b')] },
        { round: 1, slots: [slot('a')] },
      ],
    });
    expect(kinds(createState(), moved)).toEqual([]);
  });

  it('does not report the lists of divisions that come and go', () => {
    const two = createState({ divisions: [division('d1'), division('d2')] }, ['a', 'b', 'c']);
    expect(kinds(createState(), two)).toEqual(['started d2:started']);
    expect(kinds(createState(), createState({ currentRound: 1 }, ['a', 'b', 'c']))).toEqual([]);
  });

  it('tells a stopped division from one that ended', () => {
    const waiting = { status: 'WAITING', currentRound: null, divisions: [], rounds: [] } as const;
    const state = createState();
    expect(kinds(state, createState({ ...waiting, divisions: [], rounds: [] }))).toEqual([
      'stopped d1:stopped',
    ]);
    const ended = createState({ ...waiting, divisions: [], rounds: [], endedIds: ['d1'] });
    expect(kinds(state, ended)).toEqual([]);
    expect(hasJustEnded(state, ended)).toBe(true);
    expect(hasJustEnded(ended, ended)).toBe(false);
  });

  it('has nothing to report when a tablet starts', () => {
    const waiting = createState({
      status: 'WAITING',
      currentRound: null,
      divisions: [],
      rounds: [],
    });
    expect(kinds(waiting, createState())).toEqual([]);
  });
});

describe('mergeNotices', () => {
  it('replaces the notice about the same starter', () => {
    const added = { kind: 'added', id: 'a:added', name: 'A' } as const;
    const withdrawn = { kind: 'withdrawn', id: 'a:withdrawn', name: 'A' } as const;
    const other = { kind: 'added', id: 'b:added', name: 'B' } as const;
    expect(mergeNotices([added, other], [withdrawn])).toEqual([other, withdrawn]);
  });
});

describe('resolvePosition', () => {
  const slots = [slot('a'), slot('b', true), slot('c')];
  const none = () => false;

  it('starts with the first starter without a grade', () => {
    expect(resolvePosition(null, 0, slots, none).view).toBe('a');
    expect(resolvePosition(null, 0, slots, (id) => id === 'a').view).toBe('c');
    expect(resolvePosition(null, 0, slots, () => true).view).toBe('review');
  });

  it('stays at a starter that was graded elsewhere or withdrawn', () => {
    const position = { round: 0, view: 'b', fromReview: true };
    expect(resolvePosition(position, 0, slots, () => true)).toBe(position);
  });

  it('starts over in another round and when the starter is gone', () => {
    const review = { round: 0, view: 'review', fromReview: false };
    expect(resolvePosition(review, 0, slots, none)).toBe(review);
    expect(resolvePosition(review, 1, slots, none)).toEqual({ ...review, round: 1, view: 'a' });
    expect(resolvePosition({ ...review, view: 'gone' }, 0, slots, none).view).toBe('a');
  });
});

describe('findNeighbour', () => {
  it('skips withdrawn starters', () => {
    const slots = [slot('a'), slot('b', true), slot('c')];
    expect(findNeighbour(slots, 'a', 1)?.entryId).toBe('c');
    expect(findNeighbour(slots, 'c', -1)?.entryId).toBe('a');
    expect(findNeighbour(slots, 'b', -1)?.entryId).toBe('a');
    expect(findNeighbour(slots, 'c', 1)).toBeNull();
    expect(findNeighbour(slots, 'a', -1)).toBeNull();
  });
});
