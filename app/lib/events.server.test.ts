import { createEventStream, publish, subscribe } from './events.server';

const decoder = new TextDecoder();

function open(options?: Parameters<typeof createEventStream>[2], competitionId = 'c1') {
  const abort = new AbortController();
  const request = new Request('http://localhost/events', { signal: abort.signal });
  const response = createEventStream(request, competitionId, options);
  const reader = response.body!.getReader();
  async function read() {
    const { value, done } = await reader.read();
    return done ? null : decoder.decode(value);
  }
  return { abort, response, reader, read };
}

function listenerCount(competitionId: string) {
  const bus = (globalThis as any).__eventBus as Map<string, Set<unknown>>;
  return bus.get(competitionId)?.size ?? 0;
}

describe('publish and subscribe', () => {
  it('reaches the listeners of the same competition until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe('a', listener);
    publish('a', 'grades');
    publish('b', 'divisions');
    unsubscribe();
    publish('a', 'starters');
    expect(listener.mock.calls).toEqual([['grades']]);
    expect(listenerCount('a')).toBe(0);
  });

  it('is not stopped by a failing listener', () => {
    const listener = vi.fn();
    const stops = [
      subscribe('a', () => {
        throw new Error('boom');
      }),
      subscribe('a', listener),
    ];
    publish('a', 'grades');
    expect(listener).toHaveBeenCalledOnce();
    stops.forEach((stop) => stop());
  });
});

describe('createEventStream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a retry hint and then only topics', async () => {
    const { response, read, reader } = open();
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    expect(response.headers.get('Cache-Control')).toContain('no-cache');
    expect(await read()).toMatch(/^retry: \d+\n\n$/);
    publish('c1', 'grades');
    expect(await read()).toBe('data: grades\n\n');
    publish('other', 'grades');
    publish('c1', 'settings');
    expect(await read()).toBe('data: settings\n\n');
    await reader.cancel();
  });

  it('cleans up on abort', async () => {
    const { abort, read } = open();
    await read();
    expect(listenerCount('c1')).toBe(1);
    abort.abort();
    expect(await read()).toBeNull();
    expect(listenerCount('c1')).toBe(0);
  });

  it('cleans up on cancel', async () => {
    const { reader, read } = open();
    await read();
    await reader.cancel();
    expect(listenerCount('c1')).toBe(0);
  });

  it('does not subscribe for a request that is already aborted', async () => {
    const response = createEventStream(
      new Request('http://localhost', { signal: AbortSignal.abort() }),
      'c1',
    );
    await response.text();
    expect(listenerCount('c1')).toBe(0);
  });

  it('keeps the connection alive', async () => {
    vi.useFakeTimers();
    const { read, reader } = open();
    await read();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await read()).toBe(': keep-alive\n\n');
    await reader.cancel();
  });

  it('closes without sending once access is revoked', async () => {
    let allowed = true;
    const { read } = open({ isAllowed: async () => allowed });
    await read();
    publish('c1', 'grades');
    expect(await read()).toBe('data: grades\n\n');
    allowed = false;
    publish('c1', 'settings');
    expect(await read()).toBeNull();
    expect(listenerCount('c1')).toBe(0);
  });

  it('closes a silent stream once access is revoked', async () => {
    vi.useFakeTimers();
    const { read } = open({ isAllowed: async () => false });
    await read();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await read()).toBeNull();
  });

  it('closes when access cannot be checked', async () => {
    const { read } = open({ isAllowed: () => Promise.reject(new Error('no database')) });
    await read();
    publish('c1', 'grades');
    expect(await read()).toBeNull();
  });
});
