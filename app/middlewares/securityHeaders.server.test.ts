import { invalidUrlMiddleware } from './invalidUrl.server';
import { securityHeadersMiddleware } from './securityHeaders.server';

async function referrerPolicy(path: string) {
  const request = new Request(`http://localhost${path}`);
  const response = (await securityHeadersMiddleware(
    { request } as any,
    async () => new Response(),
  )) as Response;
  return response.headers.get('Referrer-Policy');
}

describe('securityHeadersMiddleware', () => {
  it.each([
    ['/judge/abc', 'no-referrer'],
    ['/DISPLAY/abc', 'no-referrer'],
    ['/competitions/1/judges', 'strict-origin-when-cross-origin'],
  ])('sets the referrer policy of %s to %s', async (path, policy) => {
    expect(await referrerPolicy(path)).toBe(policy);
  });
});

describe('invalidUrlMiddleware', () => {
  const run = async (path: string) =>
    invalidUrlMiddleware(
      { request: new Request(`http://localhost${path}`) } as any,
      async () => new Response('ok'),
    );

  it('finds nothing at addresses with a NUL byte', async () => {
    for (const path of ['/competitions/a%00', '/judge/a%00', '/home?q=%00']) {
      await expect(run(path)).rejects.toMatchObject({ status: 404 });
    }
  });

  it('lets others through', async () => {
    expect(await run('/competitions/a?q=%20100%25')).toMatchObject({ status: 200 });
  });
});
