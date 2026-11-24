import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveUpdates } from './useLiveUpdates';

class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
}

const loader = vi.fn(() => null);
const healthz = vi.fn(async () => new Response('{}'));

const note = vi.fn((_message: string | null) => true);

function Page() {
  return <p>{useLiveUpdates('/api/events/c1', note)}</p>;
}

async function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/', loader, element: <Page />, HydrateFallback: () => null }],
    { hydrationData: { loaderData: { '0': null } } },
  );
  const result = render(<RouterProvider router={router} />);
  await advance(0);
  return result;
}

function advance(ms: number) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}

function lastSource() {
  return FakeEventSource.instances.at(-1)!;
}

function setVisible(visible: boolean) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visible ? 'visible' : 'hidden');
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  loader.mockClear();
  note.mockReset().mockReturnValue(true);
  healthz.mockReset().mockImplementation(async () => new Response('{}'));
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('fetch', healthz);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLiveUpdates', () => {
  it('reports the connection status', async () => {
    await renderPage();
    expect(screen.getByText('connecting')).toBeInTheDocument();

    act(() => lastSource().onopen?.());
    expect(screen.getByText('open')).toBeInTheDocument();

    act(() => lastSource().onerror?.());
    expect(screen.getByText('lost')).toBeInTheDocument();
  });

  it('reloads once for events in quick succession', async () => {
    await renderPage();
    lastSource().onmessage?.({ data: 'grades' });
    lastSource().onmessage?.({ data: 'grades' });
    lastSource().onmessage?.({ data: 'grades' });
    await advance(1000);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('ignores the events that note rejects', async () => {
    note.mockImplementation((message) => message !== 'grades');
    await renderPage();
    lastSource().onmessage?.({ data: 'grades' });
    await advance(1000);
    expect(loader).not.toHaveBeenCalled();

    lastSource().onmessage?.({ data: 'starters a b' });
    await advance(1000);
    expect(loader).toHaveBeenCalledTimes(1);
    act(() => lastSource().onopen?.());
    expect(note.mock.calls).toEqual([['grades'], ['starters a b'], [null]]);
  });

  it('reloads after connecting and reconnecting', async () => {
    await renderPage();
    act(() => lastSource().onopen?.());
    await advance(1000);
    expect(loader).toHaveBeenCalledTimes(1);

    act(() => lastSource().onerror?.());
    act(() => lastSource().onopen?.());
    await advance(1000);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('opens a new stream when the browser gave up', async () => {
    await renderPage();
    const first = lastSource();
    first.readyState = FakeEventSource.CLOSED;
    act(() => first.onerror?.());
    await advance(5000);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(lastSource().url).toBe('/api/events/c1');
  });

  it('reloads when the page becomes visible', async () => {
    await renderPage();
    setVisible(false);
    await advance(1000);
    expect(loader).not.toHaveBeenCalled();

    setVisible(true);
    await advance(1000);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads every minute, but not while the server is unreachable', async () => {
    await renderPage();
    await advance(61_000);
    expect(loader).toHaveBeenCalledTimes(1);

    healthz.mockRejectedValue(new TypeError('Failed to fetch'));
    await advance(60_000);
    healthz.mockResolvedValue(new Response(null, { status: 503 }));
    await advance(60_000);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('stops when the page is left', async () => {
    const { unmount } = await renderPage();
    const source = lastSource();
    source.onmessage?.({ data: 'grades' });
    unmount();
    await advance(120_000);
    expect(source.close).toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
  });
});
