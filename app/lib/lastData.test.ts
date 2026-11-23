import { UNSAFE_ErrorResponseImpl as ErrorResponse } from 'react-router';
import { createLastData, INVALID_LINK } from './lastData';

const fail = (error: unknown) => async () => {
  throw error;
};

describe('createLastData', () => {
  it('keeps the last data while loading fails', async () => {
    const load = createLastData<number>();
    expect(await load('a', async () => 1)).toBe(1);
    expect(await load('a', fail(new TypeError('Failed to fetch')))).toBe(1);
    expect(await load('a', fail(new ErrorResponse(502, '', '<html>')))).toBe(1);
    // A proxy without a running app behind it.
    expect(await load('a', fail(new ErrorResponse(404, '', 'Not Found')))).toBe(1);
    expect(await load('a', async () => 2)).toBe(2);
  });

  it('gives up waiting', async () => {
    vi.useFakeTimers();
    const load = createLastData<number>();
    await load('a', async () => 1);
    const result = load('a', () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe(1);
    vi.useRealTimers();
  });

  it('fails for a reset link, the first load and another link', async () => {
    const load = createLastData<number>();
    await expect(load('a', fail(new TypeError()))).rejects.toThrow(TypeError);
    await load('a', async () => 1);
    await expect(load('b', fail(new TypeError()))).rejects.toThrow(TypeError);
    const invalid = new ErrorResponse(404, '', INVALID_LINK);
    await expect(load('a', fail(invalid))).rejects.toBe(invalid);
  });
});
