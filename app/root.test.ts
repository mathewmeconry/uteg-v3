import { createStaticHandler, RouterContextProvider } from 'react-router';
import { userContext } from './context';
import { APP_ORIGIN } from './lib/env.server';
import { getT } from './middlewares/i18n.server';
import { enqueueToast } from './middlewares/toast.server';
import { middleware } from './root';
import { truncateTables } from './tests/helpers';
import { signUp } from './tests/signUp';

beforeEach(truncateTables);

const action = vi.fn(({ context }: any) => {
  enqueueToast(context, { type: 'success', message: getT(context)('actions.save') });
  return Response.json(context.get(userContext)?.email ?? null);
});

beforeEach(() => {
  action.mockClear();
});

/** Sends a request through root's middlewares to a route below. */
async function send(path: string, headers: Record<string, string> = {}, method = 'POST') {
  const { queryRoute } = createStaticHandler([
    {
      id: 'root',
      middleware: middleware as any,
      children: [{ id: 'page', path: '*', loader: action, action }],
    },
  ]);
  const request = new Request(APP_ORIGIN + path, { method, headers });
  const run = async (query: () => Promise<unknown>) => {
    try {
      return (await query()) as Response;
    } catch (error) {
      return error as Response;
    }
  };
  return run(() =>
    queryRoute(request, {
      routeId: 'page',
      requestContext: new RouterContextProvider(),
      generateMiddlewareResponse: (query) => run(() => query(request)),
    }),
  );
}

const SAME_ORIGIN = { Origin: APP_ORIGIN };

describe('the middlewares of every request', () => {
  it('load the session, the language and toasts and set security headers', async () => {
    const { cookie } = await signUp({ email: 'a@example.com', password: 'only-for-tests' });
    const response = await send('/', {
      ...SAME_ORIGIN,
      Cookie: cookie,
      'Accept-Language': 'en',
    });
    expect(await response.json()).toBe('a@example.com');
    expect(response.headers.getSetCookie().some((cookie) => cookie.includes('Speichern'))).toBe(
      true,
    );
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it.each([
    ['en', 'de', 'Save'],
    ['de', 'en', 'Speichern'],
  ])('prefer the language of the user (%s) to the one of the browser (%s)', async (...args) => {
    const [language, browser, text] = args;
    const { cookie } = await signUp({
      email: 'a@example.com',
      password: 'only-for-tests',
      language,
    });
    const response = await send('/', {
      ...SAME_ORIGIN,
      Cookie: cookie,
      'Accept-Language': browser,
    });
    const toasts = response.headers.getSetCookie().find((cookie) => cookie.startsWith('toasts='));
    expect(decodeURIComponent(toasts!)).toContain(`"${text}"`);
  });

  it.each([
    ['a NUL byte', '/a%00', SAME_ORIGIN, 404],
    ['a large body', '/', { ...SAME_ORIGIN, 'Content-Length': '2000000' }, 413],
    ['a body without length', '/', { ...SAME_ORIGIN, 'Transfer-Encoding': 'chunked' }, 411],
    ['another origin', '/', { Origin: 'https://evil.test' }, 403],
    ['no origin', '/', {}, 403],
  ])('reject %s before the action, with security headers', async (_, path, headers, status) => {
    const response = await send(path, headers as Record<string, string>);
    expect(response.status).toBe(status);
    expect(action).not.toHaveBeenCalled();
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    // The rest of the body is not received.
    expect(response.headers.get('Connection')).toBe([411, 413].includes(status) ? 'close' : null);
  });

  it('let others through', async () => {
    expect((await send('/', SAME_ORIGIN)).status).toBe(200);
    expect((await send('/', {}, 'GET')).status).toBe(200);
  });
});
