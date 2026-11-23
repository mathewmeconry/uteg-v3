import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import {
  createMemoryRouter,
  data,
  Outlet,
  redirect,
  RouterProvider,
  useLoaderData,
} from 'react-router';
import { AutosaveGuard } from '~/components/AutosaveGuard';
import { createI18n } from '~/lib/i18n';
import { autosaveClientAction } from '~/lib/safeClientAction';
import { useActionSave, useAutosave } from './useAutosave';

let stored: { name: string; version: number };
/** "name version" of every request. */
let requests: string[];
/** Replaces what the server does. */
let answer: (() => unknown) | null;
/** The request arrives, but not its answer. */
let loseAnswer: boolean;

function Page() {
  const loaded = useLoaderData<typeof stored>();
  const save = useActionSave<string>((name, base) => ({ name, version: base.version! }));
  const form = useAutosave({
    saved: loaded.name,
    version: String(loaded.version),
    isValid: (name) => name !== '',
    save,
  });
  return (
    <div {...form.formProps}>
      <input
        aria-label="Name"
        value={form.value}
        onChange={(event) => form.setValue(event.target.value)}
      />
      <p role="status">{`${form.state} ${form.message ?? ''}`.trim()}</p>
      {form.conflict && <p>somebody saved {form.conflict.value}</p>}
      <button onClick={form.retry}>retry</button>
      <button onClick={() => form.resolveConflict('own')}>mine</button>
      <button onClick={() => form.resolveConflict('saved')}>theirs</button>
    </div>
  );
}

async function open() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <AutosaveGuard />
            <Outlet />
          </>
        ),
        children: [
          {
            index: true,
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
                  if (loseAnswer) throw new TypeError('Failed to fetch');
                  return null;
                },
              }),
          },
          { path: 'other', element: <p>other page</p> },
          { path: 'login', element: <p>login page</p> },
        ],
      },
    ],
    { hydrationData: { loaderData: { '0-0': stored } } },
  );
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
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

/** Somebody else saves and the page is loaded again, like after a live update. */
async function saveElsewhere(router: Awaited<ReturnType<typeof open>>, name: string) {
  stored = { name, version: stored.version + 1 };
  await act(() => router.revalidate());
  await advance(0);
}

const confirm = vi.fn(() => true);

beforeEach(() => {
  stored = { name: 'a', version: 1 };
  requests = [];
  answer = null;
  loseAnswer = false;
  confirm.mockReset();
  vi.stubGlobal('confirm', confirm);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('saves after a pause, based on the last save', async () => {
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

it('does not send what is invalid', async () => {
  await open();
  type('');
  fireEvent.blur(input());
  await advance(10_000);
  expect(requests).toEqual([]);
});

describe('when somebody else saves', () => {
  it('an untouched form shows it and changes nothing', async () => {
    const router = await open();
    await saveElsewhere(router, 'x');
    expect(input()).toHaveValue('x');
    fireEvent.blur(input());
    await advance(10_000);
    expect(requests).toEqual([]);
    expect(stored.name).toBe('x');
  });

  it('edits afterwards are based on it', async () => {
    const router = await open();
    await saveElsewhere(router, 'x');
    type('y');
    await advance(900);
    expect(requests).toEqual(['y 2']);
    expect(stored.name).toBe('y');
  });

  it('an edited form asks and overwrites nothing', async () => {
    const router = await open();
    type('b');
    await saveElsewhere(router, 'x');
    await advance(10_000);
    expect(screen.getByText('somebody saved x')).toBeVisible();
    expect(input()).toHaveValue('b');
    expect(requests).toEqual([]);
    await press('mine');
    expect(requests).toEqual(['b 2']);
    expect(stored.name).toBe('b');
    expect(status()).toBe('saved');
  });

  it('also when the page did not know yet', async () => {
    await open();
    stored = { name: 'x', version: 2 };
    type('b');
    await advance(900);
    expect(requests).toEqual(['b 1']);
    expect(screen.getByText('somebody saved x')).toBeVisible();
    expect(stored.name).toBe('x');
    await press('theirs');
    expect(input()).toHaveValue('x');
    await advance(10_000);
    expect(requests).toHaveLength(1);
  });
});

describe('without an answer', () => {
  it('keeps the page and tries again', async () => {
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

  it('is no conflict when the request had arrived', async () => {
    await open();
    loseAnswer = true;
    type('b');
    await advance(900);
    expect(status()).toBe('error');
    loseAnswer = false;
    await advance(6_000);
    expect(status()).toBe('saved');
    expect(screen.queryByText(/somebody saved/)).toBeNull();
    expect(stored).toEqual({ name: 'b', version: 2 });
  });
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

it('shows why the server refused it and does not send it again by itself', async () => {
  await open();
  answer = () => data({ errors: { name: 'Zu lang' } }, 400);
  type('b');
  await advance(900);
  expect(status()).toBe('error Zu lang');
  fireEvent.blur(input());
  await advance(10_000);
  expect(requests).toEqual(['b 1']);
});

describe('leaving the page', () => {
  const leave = (router: Awaited<ReturnType<typeof open>>) =>
    act(async () => {
      void router.navigate('/other');
      await vi.advanceTimersByTimeAsync(50);
    });

  it('saves first', async () => {
    const router = await open();
    type('b');
    await leave(router);
    expect(stored.name).toBe('b');
    expect(screen.getByText('other page')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['refused', () => data({ error: 'Nein' }, 400)],
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('asks when the last change is %s', async (_, failure) => {
    const router = await open();
    answer = failure;
    type('b');
    confirm.mockReturnValueOnce(false);
    await leave(router);
    expect(input()).toHaveValue('b');
    confirm.mockReturnValueOnce(true);
    await leave(router);
    expect(screen.getByText('other page')).toBeInTheDocument();
  });

  it('asks when the value is invalid', async () => {
    const router = await open();
    type('');
    confirm.mockReturnValueOnce(false);
    await leave(router);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue('');
  });

  it('does not ask without changes', async () => {
    const router = await open();
    await leave(router);
    expect(screen.getByText('other page')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
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
});
