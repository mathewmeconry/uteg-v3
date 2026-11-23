import { describe, expect, it, vi } from 'vitest';
import { originMiddleware } from './origin.server';

async function run(method: string, headers: Record<string, string> = {}) {
  const next = vi.fn(async () => new Response('ok'));
  const request = new Request('http://internal:3000/judge/token', { method, headers });
  try {
    await originMiddleware('https://uteg.example')({ request } as any, next);
    return { status: 200, next };
  } catch (error) {
    return { status: (error as Response).status, next };
  }
}

describe('originMiddleware', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('lets %s from anywhere through', async (method) => {
    const { status, next } = await run(method, { Origin: 'https://evil.example' });
    expect(status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('lets %s of the app through', async (method) => {
    expect((await run(method, { Origin: 'https://uteg.example' })).status).toBe(200);
  });

  it.each([
    ['another site', { Origin: 'https://evil.example' }],
    ['another scheme', { Origin: 'http://uteg.example' }],
    ['another port', { Origin: 'https://uteg.example:8443' }],
    ['a subdomain', { Origin: 'https://a.uteg.example' }],
    [
      'another site claiming same-origin',
      { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' },
    ],
    ['an unknown origin', { Origin: 'null' }],
    ['an unknown origin of another site', { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' }],
    ['no origin', {}],
  ])('rejects mutations from %s', async (_name, headers: Record<string, string>) => {
    const { status, next } = await run('POST', headers);
    expect(status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts forms of pages that hide their address', async () => {
    const headers = { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' };
    expect((await run('POST', headers)).status).toBe(200);
  });
});
