import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { createI18n } from '~/lib/i18n';
import DivisionProposal from './divisionProposal';

vi.mock('~/lib/divisions.server', () => ({}));
vi.mock('~/lib/domainErrors.server', () => ({}));
vi.mock('~/lib/forms.server', () => ({}));
vi.mock('~/middlewares/competition.server', () => ({}));
vi.mock('~/middlewares/i18n.server', () => ({}));
vi.mock('~/middlewares/toast.server', () => ({}));
vi.mock('~/context', () => ({}));

const action = vi.fn();

beforeEach(() => {
  action.mockReset();
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Women in K5, by club. */
async function renderPage(...clubSizes: number[]) {
  const Page = DivisionProposal as any;
  const loaderData = {
    entries: clubSizes.flatMap((size, club) =>
      Array.from({ length: size }, (_, index) => ({
        id: `${club}-${index}`,
        category: 'K5',
        sex: 'FEMALE',
        clubId: `club${club}`,
        clubName: `TV ${club}`,
      })),
    ),
    due: [0],
    numbers: { 'K5 FEMALE': 1 },
    categories: { FEMALE: ['K5', 'K6'], MALE: ['K5'] },
    apparatus: { FEMALE: ['reck', 'boden', 'schaukelringe', 'sprung'], MALE: ['boden'] },
  };
  const router = createMemoryRouter([
    {
      id: 'routes/secured/competition/layout',
      path: '/',
      loader: () => ({ competition: { id: 'c', grounds: 1, sexes: ['FEMALE', 'MALE'] } }),
      element: <Outlet />,
      HydrateFallback: () => null,
      children: [
        {
          index: true,
          action: async ({ request }) => {
            action(Object.fromEntries(await request.formData()));
            return null;
          },
          element: <Page loaderData={loaderData} params={{ contestId: 'x' }} />,
        },
      ],
    },
  ]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  await screen.findByRole('heading', { level: 1 });
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

it('follows the lineup size and saves what it shows', async () => {
  await renderPage(11, 11, 11, 11);
  expect(screen.getAllByRole('region')).toHaveLength(1);
  expect(screen.getByText('TV 0 (11)')).toBeInTheDocument();

  change('Riegengrösse', '6');
  expect(screen.getByLabelText('Anzahl Abteilungen')).toHaveValue(2);
  await userEvent.click(screen.getByRole('button', { name: '2 Abteilungen erstellen' }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const groups = JSON.parse(action.mock.calls[0][0].groups);
  expect(groups[0]).toMatchObject({ category: 'K5', sex: 'FEMALE', ground: 1 });
  const saved: Record<string, string[]>[] = groups.flatMap((group: any) => group.divisions);
  expect(saved).toHaveLength(2);
  expect(saved.flatMap((lineups) => Object.values(lineups).flat())).toHaveLength(44);
});

it('fills only as many apparatus as a small category needs', async () => {
  await renderPage(8, 8);
  const checked = screen
    .getAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-checked') === 'true');
  expect(checked).toEqual([true, true, false, false]);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Sprung' }));
  expect(screen.getAllByRole('listitem').map(({ textContent }) => textContent)).toContain(
    'Sprung0Noch niemand',
  );
});

it('moves clubs with the menu until the proposal changes', async () => {
  await renderPage(11, 11, 11, 11);
  await userEvent.click(screen.getByRole('button', { name: 'TV 0 (11) verschieben' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Boden (11)' }));
  expect(screen.getByText('über 12')).toBeInTheDocument();
  expect(screen.getByText('Noch niemand')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Abteilung erstellen' }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const [{ divisions }] = JSON.parse(action.mock.calls[0][0].groups);
  expect(divisions[0].boden).toHaveLength(22);
  expect(divisions[0].reck).toEqual([]);

  change('Anzahl Abteilungen', '2');
  expect(screen.getByText(/Der Vorschlag wurde neu berechnet/)).toBeInTheDocument();
  expect(screen.queryByText('über 12')).not.toBeInTheDocument();
});

it('puts the clubs back', async () => {
  await renderPage(11, 11, 11, 11);
  await userEvent.click(screen.getByRole('button', { name: 'TV 0 (11) verschieben' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Boden (11)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Verschiebungen zurücksetzen' }));
  expect(screen.queryByText('über 12')).not.toBeInTheDocument();
});

it('says when the starters do not fit', async () => {
  await renderPage(30, 30);
  change('Anzahl Abteilungen', '1');
  expect(screen.getByRole('alert')).toHaveTextContent('Die 60 Teilnehmenden haben so keinen Platz');
  expect(screen.getByRole('button', { name: 'Abteilung erstellen' })).toBeDisabled();
  change('Höchstens', '5');
  expect(screen.getByText('Nicht kleiner als die Riegengrösse.')).toBeInTheDocument();
});

it('proposes all categories by ground and continues the numbers', async () => {
  await renderPage(30, 30);
  await userEvent.click(screen.getByRole('radio', { name: 'Alle Kategorien' }));
  expect(screen.getByRole('region', { name: 'Wettkampfplatz 1' })).toHaveTextContent(
    /K5 Weiblich, Abteilung 2.*K5 Weiblich, Abteilung 3/,
  );
  await userEvent.click(screen.getByRole('button', { name: '2 Abteilungen erstellen' }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const groups: { divisions: object[] }[] = JSON.parse(action.mock.calls[0][0].groups);
  expect(groups).toMatchObject([
    { category: 'K5', sex: 'FEMALE', ground: 1 },
    { category: 'K5', sex: 'FEMALE', ground: 1 },
  ]);
  const ids = groups.flatMap(({ divisions }) =>
    divisions.flatMap((lineups) => Object.values(lineups).flat()),
  );
  expect(new Set(ids).size).toBe(60);
  change('Höchstens', '5');
  expect(screen.getByRole('button', { name: 'Abteilung erstellen' })).toBeDisabled();
});

it('says which clubs are split', async () => {
  await renderPage(13);
  expect(screen.getByText('Aufgeteilt: TV 0 (Reck 7, Boden 6)')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'Alle Kategorien' }));
  expect(screen.getByText('Aufgeteilt: TV 0 (Reck 7, Boden 6)')).toBeInTheDocument();
});

it('says when everybody has a division', async () => {
  await renderPage();
  expect(screen.getByText('Alle haben eine Abteilung')).toBeInTheDocument();
});
