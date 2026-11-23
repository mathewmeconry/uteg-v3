import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, data, RouterProvider } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { AccessGate } from './AccessGate';
import { TokenErrorBoundary } from './TokenErrorBoundary';

let isAllowed: boolean;
let validKey: string;
const login = vi.fn(async (_url: string, init: RequestInit) => {
  const isValid = (init.body as URLSearchParams).get('token') === validKey;
  if (isValid) isAllowed = true;
  return new Response(null, { status: isValid ? 204 : 403 });
});

beforeEach(() => {
  isAllowed = false;
  validKey = 'key';
  login.mockClear();
  vi.stubGlobal('fetch', login);
});
afterEach(() => vi.unstubAllGlobals());

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
  render(
    <StrictMode>
      <I18nextProvider i18n={createI18n('de')}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </StrictMode>,
  );
  await act(async () => {});
}

it('exchanges the key for access and removes it from the address', async () => {
  await open('/judge/1?a=b#key');
  expect(await screen.findByText('tablet')).toBeInTheDocument();
  expect(window.location.href).toMatch(/\/judge\/1\?a=b$/);
  expect(login).toHaveBeenCalledOnce();
  expect(login.mock.calls[0][0]).toBe('/api/judge/1/login');
});

it('says that the link is invalid without a key', async () => {
  await open('/judge/1');
  expect(await screen.findByText('Link ungültig')).toBeInTheDocument();
  expect(login).not.toHaveBeenCalled();
});

it('says that the link is invalid with a wrong key, also with access', async () => {
  isAllowed = true;
  await open('/judge/1#wrong');
  expect(await screen.findByText('Link ungültig')).toBeInTheDocument();
  expect(window.location.hash).toBe('');
});

it('needs no key with access', async () => {
  isAllowed = true;
  await open('/judge/1');
  expect(await screen.findByText('tablet')).toBeInTheDocument();
});

it('takes a new key while it is open', async () => {
  await open('/judge/1#old');
  expect(await screen.findByText('Link ungültig')).toBeInTheDocument();
  await act(async () => {
    window.location.hash = '#key';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(await screen.findByText('tablet')).toBeInTheDocument();
  expect(window.location.hash).toBe('');
});

it('is invalid when the server cannot be reached', async () => {
  login.mockRejectedValueOnce(new TypeError('offline'));
  await open('/judge/1#key');
  expect(await screen.findByText('Link ungültig')).toBeInTheDocument();
});
