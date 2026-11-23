import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, data, RouterProvider } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { AccessGate } from './AccessGate';
import { TokenErrorBoundary } from './TokenErrorBoundary';

const KEY = 'K'.repeat(43);
const WRONG = 'w-_'.padEnd(43, '0');

let isAllowed: boolean;
/** What the server answers instead, as long as it is down. */
let outage: (() => Response) | null;
const login = vi.fn(async (_url: string, init: RequestInit) => {
  if (outage) return outage();
  const isValid = (init.body as URLSearchParams).get('token') === KEY;
  if (isValid) isAllowed = true;
  return new Response(null, { status: isValid ? 204 : 403 });
});

beforeEach(() => {
  isAllowed = false;
  outage = null;
  login.mockClear();
  vi.stubGlobal('fetch', login);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function advance(ms: number) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}

async function open(url: string) {
  window.history.replaceState(null, '', url);
  const router = createMemoryRouter(
    [
      {
        path: '/judge/:linkId',
        loader: () => {
          if (!isAllowed) throw data(null, 403);
          return null;
        },
        element: <AccessGate>tablet</AccessGate>,
        ErrorBoundary: TokenErrorBoundary,
        HydrateFallback: () => null,
      },
    ],
    { initialEntries: ['/judge/1'] },
  );
  const result = render(
    <StrictMode>
      <I18nextProvider i18n={createI18n('de')}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </StrictMode>,
  );
  await advance(10);
  return result;
}

async function changeHash(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await advance(10);
}

const expectTablet = () => expect(screen.getByText('tablet')).toBeInTheDocument();
const expectInvalid = () => expect(screen.getByText('Link ungültig')).toBeInTheDocument();

it('exchanges the key for access and removes it from the address', async () => {
  await open(`/judge/1?a=b#${KEY}`);
  expectTablet();
  expect(window.location.href).toMatch(/\/judge\/1\?a=b$/);
  expect(login.mock.calls[0][0]).toBe('/api/judge/1/login');
});

it('says that the link is invalid without a key', async () => {
  await open('/judge/1');
  expectInvalid();
  expect(login).not.toHaveBeenCalled();
});

it('says that the link is invalid with a wrong key, also with access', async () => {
  isAllowed = true;
  await open(`/judge/1#${WRONG}`);
  expectInvalid();
  expect(window.location.hash).toBe('');
});

it('needs no key with access', async () => {
  isAllowed = true;
  await open('/judge/1');
  expectTablet();
});

it('takes a new key while it is open', async () => {
  await open(`/judge/1#${WRONG}`);
  expectInvalid();
  await changeHash(`#${KEY}`);
  expectTablet();
  expect(window.location.hash).toBe('');
});

it('leaves hashes alone that are no key, like the one of the skip link', async () => {
  isAllowed = true;
  await open('/judge/1#content');
  expectTablet();
  await changeHash('#main');
  expectTablet();
  expect(window.location.hash).toBe('#main');
  expect(login).not.toHaveBeenCalled();
});

describe.each([
  ['the network', () => Promise.reject(new TypeError('offline')) as never],
  ['the server', () => new Response(null, { status: 502 })],
])('when %s is down', (_, failure) => {
  beforeEach(() => {
    outage = failure;
  });

  it('keeps trying with the key', async () => {
    await open(`/judge/1#${KEY}`);
    expect(window.location.hash).toBe('');
    await advance(20_000);
    expect(screen.getByRole('status')).toBeInTheDocument();
    outage = null;
    await advance(5_000);
    expectTablet();
    login.mockClear();
    await advance(60_000);
    expect(login).not.toHaveBeenCalled();
  });

  it('does not replace a working page', async () => {
    isAllowed = true;
    await open(`/judge/1#${KEY}`);
    expectTablet();
    await advance(10_000);
    expectTablet();
    outage = null;
    await advance(5_000);
    expectTablet();
  });

  it('prefers a newer key', async () => {
    await open(`/judge/1#${WRONG}`);
    await changeHash(`#${KEY}`);
    outage = null;
    await advance(5_000);
    expectTablet();
    await advance(10_000);
    expectTablet();
  });

  it('stops when the page is left', async () => {
    const { unmount } = await open(`/judge/1#${KEY}`);
    unmount();
    login.mockClear();
    await advance(30_000);
    expect(login).not.toHaveBeenCalled();
  });
});
