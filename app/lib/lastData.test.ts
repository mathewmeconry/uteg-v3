import { UNSAFE_ErrorResponseImpl as ErrorResponse } from 'react-router';
import { createLastData } from './lastData';

const fail = (error: unknown) => async () => {
  throw error;
};

describe('createLastData', () => {
  it('keeps the last data while loading fails', async () => {
    const { load, remember } = createLastData<number>();
    remember('a', 1);
    expect(await load('a', fail(new TypeError('Failed to fetch')))).toBe(1);
    expect(await load('a', fail(new ErrorResponse(502, '', '<html>')))).toBe(1);
    // A proxy, not this app.
    expect(await load('a', fail(new ErrorResponse(403, '', '<html>')))).toBe(1);
    expect(await load('a', fail(new ErrorResponse(403, '', '')))).toBe(1);
    expect(await load('a', async () => 2)).toBe(2);
  });

  it('gives up waiting', async () => {
    vi.useFakeTimers();
    const { load, remember } = createLastData<number>();
    remember('a', 1);
    const result = load('a', () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe(1);
    vi.useRealTimers();
  });

  it('fails without data and for another link', async () => {
    const { load, remember } = createLastData<number>();
    await expect(load('a', fail(new TypeError()))).rejects.toThrow(TypeError);
    remember('a', 1);
    await expect(load('b', fail(new TypeError()))).rejects.toThrow(TypeError);
  });

  it('forgets the data when the access is denied', async () => {
    const { load, remember } = createLastData<number>();
    remember('a', 1);
    const denied = new ErrorResponse(403, '', null);
    await expect(load('a', fail(denied))).rejects.toBe(denied);
    await expect(load('a', fail(new TypeError()))).rejects.toThrow(TypeError);
  });
});
