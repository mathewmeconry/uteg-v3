import { advance, countGrades, selectStarters, showAll } from './displayState';

const slot = (entryId: string, value: number | null, withdrawn = false) => ({
  entryId,
  withdrawn,
  grade: value === null ? null : { value },
});

const select = (slots: ReturnType<typeof slot>[], count = countGrades(slots)) => {
  const { current, next } = selectStarters(slots, count);
  return [current?.entryId ?? null, current?.grade?.value ?? null, next?.entryId ?? null];
};

describe('selectStarters', () => {
  it('starts with the first starter without a grade', () => {
    expect(select([slot('a', null), slot('b', null)])).toEqual(['a', null, 'b']);
  });

  it('shows the last one before the first without a grade', () => {
    expect(select([slot('a', 9000), slot('b', null)])).toEqual(['a', 9000, 'b']);
    expect(select([slot('a', 9000), slot('b', 0), slot('c', null)])).toEqual(['b', 0, 'c']);
    // A grade entered out of order waits for its turn.
    expect(select([slot('a', 9000), slot('b', null), slot('c', 8000)])).toEqual(['a', 9000, 'b']);
  });

  it('shows earlier grades when later ones have to wait', () => {
    const slots = [slot('a', 9000), slot('b', 9100), slot('c', 9200)];
    expect(select(slots, 1)).toEqual(['a', 9000, 'b']);
    expect(select(slots, 2)).toEqual(['b', 9100, 'c']);
  });

  it('ends with the last starter', () => {
    expect(select([slot('a', 9000), slot('b', 9100)])).toEqual(['b', 9100, null]);
  });

  it('skips withdrawn starters', () => {
    const slots = [
      slot('a', 9000),
      slot('b', null, true),
      slot('c', 9100),
      slot('d', null, true),
      slot('e', null),
    ];
    expect(select(slots)).toEqual(['c', 9100, 'e']);
  });

  it('is empty in a pause', () => {
    expect(select([])).toEqual([null, null, null]);
    expect(select([slot('a', null, true)])).toEqual([null, null, null]);
  });
});

describe('advance', () => {
  /** Grades per round, for one apparatus or several. */
  const live = (
    round: number,
    apparatus: Record<string, (number | null)[][]>,
    divisionIds = ['d1'],
  ) => ({
    round,
    divisionIds,
    apparatus: Object.entries(apparatus).map(([key, rounds]) => ({
      apparatus: key,
      rounds: rounds.map((grades) => grades.map((value, index) => slot(`${index}`, value))),
    })),
  });
  type Live = ReturnType<typeof live>;

  function start(first: Live) {
    let shown = showAll(first, 0);
    let now = 0;
    return {
      /** Round and counts after the time passed, second by second like the display does. */
      at(seconds: number, data: Live) {
        for (; now <= seconds * 1000; now += 1000) shown = advance(shown, data, now);
        return [shown.round, ...Object.values(shown.steps).map(({ count }) => count)];
      },
    };
  }

  it('shows everything at once after a reload', () => {
    const data = live(2, { reck: [[], [], [1, 2, null]] });
    expect(start(data).at(0, data)).toEqual([2, 2]);
  });

  it('shows the first grade at once and every other one after 30 seconds', () => {
    const { at } = start(live(0, { reck: [[null, null, null]] }));
    const all = live(0, { reck: [[1, 2, 3]] });
    expect(at(0, live(0, { reck: [[1, null, null]] }))).toEqual([0, 1]);
    expect(at(29, all)).toEqual([0, 1]);
    expect(at(30, all)).toEqual([0, 2]);
    expect(at(59, all)).toEqual([0, 2]);
    expect(at(60, all)).toEqual([0, 3]);
  });

  it('does not wait for a grade that was shown long enough', () => {
    const { at } = start(live(0, { reck: [[1, null]] }));
    at(40, live(0, { reck: [[1, null]] }));
    expect(at(41, live(0, { reck: [[1, 2]] }))).toEqual([0, 2]);
  });

  it('counts for each apparatus', () => {
    const { at } = start(live(0, { reck: [[null, null]], boden: [[null, null]] }));
    expect(at(1, live(0, { reck: [[1, 2]], boden: [[null, null]] }))).toEqual([0, 1, 0]);
    expect(at(20, live(0, { reck: [[1, 2]], boden: [[1, 2]] }))).toEqual([0, 1, 1]);
    expect(at(31, live(0, { reck: [[1, 2]], boden: [[1, 2]] }))).toEqual([0, 2, 1]);
  });

  it('removes deleted grades at once', () => {
    const { at } = start(live(0, { reck: [[1, 2]] }));
    expect(at(1, live(0, { reck: [[1, null]] }))).toEqual([0, 1]);
  });

  it('starts the next round after the last grades were shown', () => {
    const { at } = start(live(0, { reck: [[1, null], [null]], boden: [[], [null]] }));
    const next = live(1, {
      reck: [[1, 2], [null]],
      boden: [[], [5]],
    });
    expect(at(1, next)).toEqual([0, 1, 0]);
    expect(at(59, next)).toEqual([0, 2, 0]);
    expect(at(60, next)).toEqual([1, 0, 0]);
    expect(at(61, next)).toEqual([1, 0, 1]);
  });

  it('starts the next round at once when the grades were there long enough', () => {
    const { at } = start(live(0, { reck: [[1], [null]] }));
    at(40, live(0, { reck: [[1], [null]] }));
    expect(at(41, live(1, { reck: [[1], [null]] }))).toEqual([1, 0]);
  });

  it('catches up when several rounds pass meanwhile', () => {
    const { at } = start(live(0, { reck: [[1], [1], [null]] }));
    expect(at(30, live(2, { reck: [[1], [1], [null]] }))).toEqual([2, 0]);
  });

  it('shows other and restarted divisions at once', () => {
    const { at } = start(live(1, { reck: [[1], [1]] }));
    expect(at(1, live(0, { reck: [[1, 1], []] }))).toEqual([0, 2]);
    expect(at(2, live(1, { reck: [[], [1, 1]] }, ['d2']))).toEqual([1, 2]);
    expect(at(3, live(0, {}, []))).toEqual([0]);
  });

  it('returns the same object when nothing changes', () => {
    const data = live(0, { reck: [[1, null]] });
    const shown = showAll(data, 0);
    expect(advance(shown, data, 90_000)).toBe(shown);
    const waiting = showAll(live(0, {}, []), 0);
    expect(advance(waiting, live(0, {}, []), 1)).toBe(waiting);
  });
});
