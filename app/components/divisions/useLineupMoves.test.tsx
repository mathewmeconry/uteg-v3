import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider, useLoaderData } from 'react-router';
import { toast } from 'sonner';
import { createI18n } from '~/lib/i18n';
import { UNASSIGNED, type Column, type Move } from './lineupMoves';
import { useLineupMoves } from './useLineupMoves';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const URL = '/api/lineups/d1';
let server: Column[];
let move: (next: Move) => void;
/** Answers the oldest waiting request. */
let answers: ((answer: Response | Error) => void)[];
let reachable: boolean;
const sent = vi.fn<(url: string, values: string[]) => void>();
const loader = vi.fn(() => ({ columns: server }));

beforeEach(() => {
  vi.clearAllMocks();
  server = [
    { id: UNASSIGNED, entryIds: [] },
    { id: 'reck', entryIds: ['a', 'b'] },
  ];
  answers = [];
  reachable = true;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/healthz') {
      if (!reachable) throw new TypeError('Failed to fetch');
      return new Response('{}');
    }
    sent(url, [...(init!.body as FormData).values()] as string[]);
    return new Promise<Response>((resolve, reject) => {
      answers.push((answer) => (answer instanceof Error ? reject(answer) : resolve(answer)));
    });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Page() {
  const loaderData = useLoaderData<{ columns: Column[] }>();
  const moves = useLineupMoves(URL, loaderData.columns, loaderData);
  useEffect(() => {
    move = moves.move;
  });
  return <p>{moves.columns.map(({ entryIds }) => entryIds.join('')).join('|')}</p>;
}

async function setup() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Page />,
        loader,
        HydrateFallback: () => null,
        errorElement: <p>error page</p>,
      },
      { path: '/other', element: <p>other page</p> },
    ],
    {},
  );
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  await screen.findByText('|ab');
  loader.mockClear();
  return router;
}

async function settle(run: () => void = () => {}) {
  await act(async () => {
    run();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function answer(value: Response | Error) {
  await settle(() => answers.shift()!(value));
}

const ok = () => Response.json({ ok: true });
const UP: Move = { entryIds: ['b'], columnId: 'reck', beforeId: 'a' };
const OUT: Move = { entryIds: ['a'], columnId: UNASSIGNED };

it('shows moves at once and sends them one after the other', async () => {
  await setup();
  await settle(() => {
    move(UP);
    move(OUT);
  });
  expect(screen.getByText('a|b')).toBeInTheDocument();
  expect(sent.mock.calls).toEqual([[URL, ['b', 'move', 'reck', 'a']]]);

  server = [server[0], { id: 'reck', entryIds: ['b', 'a'] }];
  await answer(ok());
  expect(sent.mock.calls[1]).toEqual([URL, ['a', 'unassign']]);
  expect(screen.getByText('a|b')).toBeInTheDocument();

  server = [
    { id: UNASSIGNED, entryIds: ['a'] },
    { id: 'reck', entryIds: ['b'] },
  ];
  await answer(ok());
  expect(screen.getByText('a|b')).toBeInTheDocument();
  expect(toast.error).not.toHaveBeenCalled();
});

it('drops a refused move and shows why', async () => {
  await setup();
  await settle(() => move(UP));
  await answer(Response.json({ error: 'Geht nicht.' }, { status: 400 }));
  expect(screen.getByText('|ab')).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalledWith('Geht nicht.', expect.anything());
  expect(loader).toHaveBeenCalledTimes(1);
});

it.each([
  ['no connection', new TypeError('Failed to fetch')],
  ['a proxy error', new Response('<h1>Bad Gateway</h1>', { status: 502 })],
  ['a proxy page', new Response('<h1>Hello</h1>')],
])('drops the move and stays on the page after %s', async (_name, failure) => {
  await setup();
  reachable = false;
  await settle(() => move(UP));
  await answer(failure);
  expect(screen.getByText('|ab')).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining('Verbindung'),
    expect.anything(),
  );
  expect(loader).not.toHaveBeenCalled();

  // The next one works again.
  reachable = true;
  await settle(() => move(OUT));
  expect(screen.getByText('a|b')).toBeInTheDocument();
});

it('reloads after a failure when the server is there again', async () => {
  await setup();
  await settle(() => move(UP));
  server = [server[0], { id: 'reck', entryIds: ['b', 'a'] }];
  await answer(new TypeError('Failed to fetch'));
  // The move had arrived after all.
  expect(screen.getByText('|ba')).toBeInTheDocument();
});

it('still sends everything after leaving the page', async () => {
  const router = await setup();
  await settle(() => {
    move(UP);
    move(OUT);
  });
  await settle(() => void router.navigate('/other'));
  expect(screen.getByText('other page')).toBeInTheDocument();
  await answer(ok());
  await answer(ok());
  expect(sent.mock.calls.map(([url]) => url)).toEqual([URL, URL]);
});
