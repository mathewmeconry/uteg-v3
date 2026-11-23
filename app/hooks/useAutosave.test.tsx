import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, data, redirect, RouterProvider, useLoaderData } from 'react-router';
import { autosaveClientAction } from '~/lib/safeClientAction';
import { useActionSave, useAutosave } from './useAutosave';

let stored: { name: string; version: number };
let requests: string[];
/** Replaces what the server does with the next requests. */
let answer: (() => unknown) | null;

function Page() {
  const loaded = useLoaderData<typeof stored>();
  const [name, setName] = useState(loaded.name);
  const save = useActionSave((next: string) => ({ name: next, version: String(loaded.version) }));
  const { state, message, isConflict, flush, resolveConflict, formProps } = useAutosave({
    value: name,
    saved: loaded.name,
    isValid: name !== '',
    save,
  });
  return (
    <div {...formProps}>
      <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <p role="status">{isConflict ? 'conflict' : `${state} ${message ?? ''}`.trim()}</p>
      <button onClick={flush}>retry</button>
      <button onClick={() => resolveConflict(loaded.name)}>resolve</button>
    </div>
  );
}

async function open() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () => stored,
        element: <Page />,
        errorElement: <p>error page</p>,
        action: ({ request }) =>
          autosaveClientAction({
            async serverAction() {
              const fields = new URLSearchParams(await request.text());
              requests.push(`${fields.get('name')} ${fields.get('version')}`);
              if (answer) return answer();
              if (Number(fields.get('version')) !== stored.version) {
                return data({ conflict: true }, 409);
              }
              stored = { name: fields.get('name')!, version: stored.version + 1 };
              return null;
            },
          }),
      },
      { path: '/other', element: <p>other page</p> },
      { path: '/login', element: <p>login page</p> },
    ],
    { hydrationData: { loaderData: { '0': stored } } },
  );
  render(<RouterProvider router={router} />);
  await advance(0);
  return router;
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const input = () => screen.getByLabelText<HTMLInputElement>('Name');
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const status = () => screen.getByRole('status').textContent;

async function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  await advance(10);
}

beforeEach(() => {
  stored = { name: 'a', version: 1 };
  requests = [];
  answer = null;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('saves after a pause, with the version of the last save', async () => {
  await open();
  type('b');
  await advance(790);
  expect(requests).toEqual([]);
  await advance(50);
  expect(requests).toEqual(['b 1']);
  expect(status()).toBe('saved');
  type('c');
  await advance(900);
  expect(requests).toEqual(['b 1', 'c 2']);
  expect(stored).toEqual({ name: 'c', version: 3 });
});

it.each([
  ['the field is left', () => fireEvent.blur(input())],
  ['Enter is pressed', () => fireEvent.keyDown(input(), { key: 'Enter' })],
])('saves at once when %s', async (_, leave) => {
  await open();
  type('b');
  leave();
  await advance(10);
  expect(requests).toEqual(['b 1']);
});

it('saves when the tab is hidden', async () => {
  await open();
  type('b');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  await advance(10);
  expect(requests).toEqual(['b 1']);
  vi.restoreAllMocks();
});

it('saves when the page is left', async () => {
  const router = await open();
  type('b');
  await act(() => router.navigate('/other'));
  await advance(10);
  expect(requests).toEqual(['b 1']);
});

it('does not send what is invalid', async () => {
  await open();
  type('');
  fireEvent.blur(input());
  await advance(10_000);
  expect(requests).toEqual([]);
});

it('keeps the page without a connection and tries again', async () => {
  await open();
  answer = () => Promise.reject(new TypeError('Failed to fetch'));
  type('b');
  await advance(900);
  expect(status()).toBe('error');
  expect(input()).toHaveValue('b');
  answer = null;
  window.dispatchEvent(new Event('online'));
  await advance(10);
  expect(status()).toBe('saved');
  expect(stored.name).toBe('b');
});

it('keeps the input when the session has ended', async () => {
  await open();
  answer = () => {
    throw redirect('/login?redirectTo=%2F');
  };
  type('b');
  await advance(900);
  expect(status()).toBe('error');
  expect(input()).toHaveValue('b');
  // Signed in again in another tab.
  answer = null;
  await press('retry');
  expect(stored.name).toBe('b');
});

it('follows other redirects', async () => {
  await open();
  answer = () => {
    throw redirect('/other');
  };
  type('b');
  await advance(900);
  expect(screen.getByText('other page')).toBeInTheDocument();
});

it('shows why the server refused it', async () => {
  await open();
  answer = () => data({ errors: { name: 'Zu lang' } }, 400);
  type('b');
  await advance(900);
  expect(status()).toBe('error Zu lang');
});

it('asks before replacing what somebody else changed', async () => {
  await open();
  stored = { name: 'x', version: 2 };
  type('b');
  await advance(900);
  expect(status()).toBe('conflict');
  type('c');
  await advance(10_000);
  expect(requests).toEqual(['b 1']);
  expect(stored.name).toBe('x');
});

it.each([
  ['warns before closing with unsaved input', '', true],
  ['lets a saved page be closed', 'a', false],
])('%s', async (_, value, warns) => {
  await open();
  type(value);
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(warns);
});
