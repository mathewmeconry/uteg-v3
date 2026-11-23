import { selectStarters } from './displayState';

const slot = (entryId: string, value: number | null, withdrawn = false) => ({
  entryId,
  withdrawn,
  grade: value === null ? null : { value },
});

const select = (slots: ReturnType<typeof slot>[]) => {
  const { current, next } = selectStarters(slots);
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
