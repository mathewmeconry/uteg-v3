import { act, renderHook } from '@testing-library/react';
import { useDelayedRound, useIsExpired } from './useDisplayTimers';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('useDelayedRound', () => {
  function render(round: number, ids = ['d1']) {
    return renderHook(
      (props: { round: number; ids: string[] }) => useDelayedRound(props.round, props.ids),
      { initialProps: { round, ids } },
    );
  }

  it('shows the current round at once after a reload', () => {
    expect(render(2).result.current).toBe(2);
  });

  it('waits 30 seconds with the next round', () => {
    const { result, rerender } = render(0);
    rerender({ round: 1, ids: ['d1'] });
    expect(result.current).toBe(0);
    advance(29_999);
    // Every live update renders again and must not start over.
    rerender({ round: 1, ids: ['d1'] });
    expect(result.current).toBe(0);
    advance(1);
    expect(result.current).toBe(1);
    rerender({ round: 2, ids: ['d1'] });
    expect(result.current).toBe(1);
    advance(30_000);
    expect(result.current).toBe(2);
  });

  it('catches up when several rounds pass meanwhile', () => {
    const { result, rerender } = render(0);
    rerender({ round: 1, ids: ['d1'] });
    advance(20_000);
    rerender({ round: 2, ids: ['d1'] });
    advance(10_000);
    expect(result.current).toBe(2);
  });

  it('shows other and restarted divisions at once', () => {
    const { result, rerender } = render(3);
    rerender({ round: 0, ids: ['d1'] });
    expect(result.current).toBe(0);
    rerender({ round: 2, ids: ['d2'] });
    expect(result.current).toBe(2);
  });

  it('shows the first round at once after waiting', () => {
    const { result, rerender } = render(0, []);
    rerender({ round: 1, ids: ['d1'] });
    expect(result.current).toBe(1);
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
