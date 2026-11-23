import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, data, Outlet, RouterProvider, useLoaderData } from 'react-router';
import type { Division } from '~/components/divisions/divisionList';
import { createI18n } from '~/lib/i18n';
import { safeClientAction } from '~/lib/safeClientAction';
import DivisionsPage, { clientAction } from './divisions';

vi.mock('~/lib/divisions.server', () => ({}));
vi.mock('~/lib/domainErrors.server', () => ({}));
vi.mock('~/middlewares/competition.server', () => ({}));
vi.mock('~/middlewares/i18n.server', () => ({}));
vi.mock('~/middlewares/toast.server', () => ({}));
vi.mock('~/context', () => ({}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

let divisions: Division[];
const action = vi.fn();

function division(id: string, values: Partial<Division>) {
  return {
    id,
    category: 'K5',
    sex: 'FEMALE',
    number: 1,
    ground: 1,
    state: 'PENDING',
    round: 0,
    rounds: 4,
    starterCount: 3,
    unassignedCount: 0,
    progress: {},
    ...values,
  } as Division;
}

beforeEach(() => {
  action.mockReset();
  divisions = [division('a', {}), division('b', { category: 'K6', sex: 'MALE', state: 'ENDED' })];
  vi.stubGlobal('fetch', async () => new Response('{}'));
  vi.stubGlobal(
    'EventSource',
    class {
      close() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPage(url = '/') {
  const Page = DivisionsPage as any;
  const router = createMemoryRouter(
    [
      {
        id: 'routes/secured/competition/layout',
        path: '/',
        loader: () => ({ competition: { id: 'c', grounds: 2 }, canEdit: true }),
        element: <Outlet />,
        HydrateFallback: () => null,
        children: [
          {
            index: true,
            loader: () => ({
              divisions,
              running: [],
              categories: { FEMALE: ['K5'], MALE: ['K5'] },
            }),
            action: async ({ request }) => action([...(await request.formData())]),
            Component: function Component() {
              return <Page loaderData={useLoaderData()} />;
            },
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  await screen.findByRole('heading', { name: 'Abteilungen' });
  return router;
}

const rows = () => screen.queryAllByRole('heading', { level: 2 }).map((row) => row.textContent);
const button = (name: RegExp | string) => screen.getByRole('button', { name });

it('keeps the page when an action fails', () => {
  expect(clientAction).toBe(safeClientAction);
});

describe('search', () => {
  it('filters by name, ground and state, only the shown ones are selected', async () => {
    await renderPage();
    const search = screen.getByRole('searchbox', { name: 'Suche' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Alle auswählen' }));
    await userEvent.type(search, 'männlich platz 1 beendet');
    expect(rows()).toEqual(['K6 Männlich']);
    expect(screen.getByText('1 ausgewählt')).toBeInTheDocument();
  });

  it('is reset together with the filters, and the focus stays on the page', async () => {
    await renderPage('/?category=K7');
    await userEvent.type(screen.getByRole('searchbox'), 'x');
    await userEvent.click(button('Filter zurücksetzen'));
    await waitFor(() => expect(rows()).toEqual(['K5 Weiblich', 'K6 Männlich']));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(document.body).not.toHaveFocus();
  });
});

describe('focus', () => {
  it('returns to the button that opened the dialog', async () => {
    await renderPage();
    await userEvent.click(button(/^Starten: K5/));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(button(/^Starten: K5/)).toHaveFocus());
  });

  it('returns to the menu that opened the dialog', async () => {
    await renderPage();
    const menu = () => button(/^Weitere Aktionen für K5/);
    menu().focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Löschen' }));
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(menu()).toHaveFocus());
  });

  it('goes to the list when the opener is gone', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('checkbox', { name: /K5 Weiblich.*auswählen/ }));
    await userEvent.click(button('Löschen'));
    action.mockImplementation(() => {
      divisions = [divisions[1]];
      return null;
    });
    await userEvent.click(within(screen.getByRole('alertdialog')).getByText('Löschen'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.body).not.toHaveFocus());
    expect(document.activeElement).toContainElement(screen.getByRole('list'));
  });
});

describe('dialog while sending', () => {
  it('keeps what was sent while live updates come in, and shows the truth after a failure', async () => {
    const router = await renderPage();
    let answer = (_: unknown) => {};
    action.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await userEvent.click(button(/^Starten: K5/));
    const dialog = within(screen.getByRole('alertdialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Starten' }));
    expect(action).toHaveBeenCalledWith([
      ['intent', 'start'],
      ['division', 'a'],
    ]);

    divisions = [{ ...divisions[0], state: 'RUNNING' }, divisions[1]];
    await act(() => router.revalidate());
    expect(dialog.getByText(/K5 Weiblich, Abteilung 1/)).toBeInTheDocument();
    expect(dialog.queryByText(/nichts mehr zu tun/)).not.toBeInTheDocument();

    await act(async () => answer(data({ error: 'Geht nicht.' }, 400)));
    await waitFor(() => expect(dialog.getByText(/nichts mehr zu tun/)).toBeInTheDocument());
  });
});
