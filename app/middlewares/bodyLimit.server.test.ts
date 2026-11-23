import { bodyLimitMiddleware } from './bodyLimit.server';

const MB = 1024 * 1024;

async function status(path: string, headers: Record<string, string> = {}) {
  const request = new Request(`http://localhost${path}`, { method: 'POST', headers });
  try {
    const response = await bodyLimitMiddleware({ request } as any, async () => new Response('ok'));
    return (response as Response).status;
  } catch (error) {
    return (error as Response).status;
  }
}

describe('bodyLimitMiddleware', () => {
  it.each([
    ['/login', 1 * MB, 200],
    ['/login', 1 * MB + 1, 413],
    ['/competitions/c/starters', 2 * MB, 413],
    ['/api/judge/l/login', 2 * MB, 413],
    ['/competitions/c/starters/import', 20 * MB, 200],
    ['/competitions/c/starters/import', 20 * MB + 1, 413],
    ['/competitions/c/starters/import.data', 20 * MB, 200],
    ['/competitions/c/starters/import/_.data', 20 * MB, 200],
    ['/competitions/c/settings.data?_routes=x', 5 * MB, 200],
    ['/competitions/new.data', 5 * MB, 200],
    ['/competitions/c/contests/k/settings', 5 * MB, 413],
  ])('on %s answers %s bytes with %s', async (path, length, expected) => {
    expect(await status(path, { 'Content-Length': String(length) })).toBe(expected);
  });

  it('needs the length of a body', async () => {
    expect(await status('/login', { 'Transfer-Encoding': 'chunked' })).toBe(411);
    expect(await status('/login')).toBe(200);
  });
});
