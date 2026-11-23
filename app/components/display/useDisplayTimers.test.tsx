import { act, renderHook } from '@testing-library/react';
import { useIsExpired, useShown } from './useDisplayTimers';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('useShown', () => {
  const live = (...values: (number | null)[]) => ({
    round: 0,
    divisionIds: ['d1'],
    apparatus: [
      {
        apparatus: 'reck',
        rounds: [
          values.map((value, index) => ({
            entryId: `${index}`,
            withdrawn: false,
            grade: value === null ? null : { value },
          })),
        ],
      },
    ],
  });

  it('shows new grades one after the other, live updates do not start over', () => {
    const { result, rerender } = renderHook(useShown, { initialProps: live(null, null) });
    rerender(live(1, null));
    expect(result.current.steps.reck.count).toBe(1);
    advance(20_000);
    rerender(live(1, 2));
    expect(result.current.steps.reck.count).toBe(1);
    advance(10_000);
    expect(result.current.steps.reck.count).toBe(2);
  });
});

describe('useIsExpired', () => {
  it('expires after the given time and starts over with new data', () => {
    const { result, rerender } = renderHook((ms: number | null) => useIsExpired(ms), {
      initialProps: 300_000 as number | null,
    });
    advance(299_999);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
    rerender(null);
    expect(result.current).toBe(false);
  });

  it('never expires while divisions run', () => {
    const { result } = renderHook(() => useIsExpired(null));
    advance(10 * 60_000);
    expect(result.current).toBe(false);
  });
});
