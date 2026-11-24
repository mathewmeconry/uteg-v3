import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub, Link, Outlet, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StarterRow } from '~/components/starters/starterRow';
import { createI18n } from '~/lib/i18n';
import Starters from './starters';

vi.mock('~/components/starters/postIds', () => ({ postIds: vi.fn() }));
const { postIds } = await import('~/components/starters/postIds');

const CLUBS = [
  { id: 'chur', name: 'TV Chur', location: 'Chur' },
  { id: 'buchs', name: 'TV Buchs', location: 'Buchs' },
];

// The long list takes its time in jsdom.
configure({ asyncUtilTimeout: 5000 });

/** 100 starters, every fourth from Buchs. */
const STARTERS = Array.from({ length: 100 }, (_, index): StarterRow => {
  const number = String(index).padStart(3, '0');
  const person = {
    firstname: `Anna${number}`,
    lastname: 'Muster',
    birthYear: 2010,
    sex: 'FEMALE' as const,
  };
  return {
    id: number,
    ...person,
    club: CLUBS[index % 4 === 0 ? 1 : 0],
    stvId: null,
    athleteId: number,
    athlete: person,
    differs: index === 0,
    entryId: number,
    category: 'K5',
    divisionId: null,
    divisionNumber: null,
    startApparatus: null,
  };
});

beforeEach(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal(
    'EventSource',
    class {
      close() {}
    },
  );
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});
afterEach(() => vi.unstubAllGlobals());

function Address() {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{pathname + search}</p>;
}

async function renderPage({
  canEdit = true,
  isCheckIn = false,
  entries = ['/'],
  link = 'returnBack',
}: {
  canEdit?: boolean;
  isCheckIn?: boolean;
  entries?: string[];
  link?: 'returnBack' | 'plain';
} = {}) {
  const linkState = link === 'returnBack' ? { returnBack: true } : undefined;
  const Stub = createRoutesStub([
    {
      id: 'routes/secured/competition/layout',
      path: '/',
      loader: () => ({
        competition: { id: 'c' },
        contests: [{ id: 'contest', name: 'EGT' }],
        canEdit,
        isCheckIn,
      }),
      Component: () => (
        <I18nextProvider i18n={createI18n('de')}>
          <Address />
          <Outlet />
        </I18nextProvider>
      ),
      children: [
        {
          index: true,
          loader: () => ({
            starters: STARTERS,
            clubs: CLUBS,
            contest: {
              id: 'contest',
              name: 'EGT',
              categories: { FEMALE: ['K5'], MALE: ['K5'] },
              apparatus: ['reck'],
              divisions: [{ id: 'd', category: 'K5', sex: 'FEMALE', number: 1, apparatus: [] }],
            },
          }),
          action: () => ({ ok: true }),
          // The props are typed for the real route.
          Component: Starters as never,
        },
        {
          path: 'lineups',
          Component: () => (
            <Link to="/?edit=003" state={linkState}>
              Anna003
            </Link>
          ),
        },
      ],
    },
  ]);
  render(<Stub initialEntries={entries} />);
  if (entries[0] === '/lineups') {
    await userEvent.click(await screen.findByRole('link', { name: 'Anna003' }));
    await screen.findByRole('dialog');
  }
  const table = within(await screen.findByRole('table', { hidden: true }));
  return { user: userEvent.setup(), table, rows: () => table.getAllByRole('row').slice(1) };
}

it('renders long lists in parts', async () => {
  const { user, rows } = await renderPage();
  expect(rows()).toHaveLength(60);
  await user.click(screen.getByRole('button', { name: 'Mehr anzeigen' }));
  expect(rows()).toHaveLength(100);
});

it('selects all filtered starters, also those not rendered yet', async () => {
  const { user, table, rows } = await renderPage();
  await user.click(screen.getByRole('button', { name: 'Verein filtern' }));
  await user.click(screen.getByRole('option', { name: /TV Chur/ }));
  await user.keyboard('{Escape}');
  expect(screen.getByText('75 von 100 Teilnehmenden')).toBeInTheDocument();
  expect(rows()).toHaveLength(60);

  await user.click(table.getByRole('checkbox', { name: 'Alle gefilterten auswählen (75)' }));
  expect(screen.getByText('75 Personen ausgewählt')).toBeInTheDocument();

  // The selection outlives other filters, and says so.
  await user.type(screen.getByRole('searchbox'), 'anna001');
  await waitFor(() => expect(rows()).toHaveLength(1));
  expect(screen.getByText('davon 74 durch Filter ausgeblendet')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Auswahl aufheben' }));
  expect(screen.queryByText(/ausgewählt$/)).not.toBeInTheDocument();
});

it('exports the filtered starters in the shown order', async () => {
  const { user, table, rows } = await renderPage();
  await user.type(screen.getByRole('searchbox'), 'buchs anna00');
  await waitFor(() => expect(rows()).toHaveLength(3));
  const sort = table.getByRole('button', { name: 'Vorname' });
  await user.click(sort);
  await user.click(sort);
  expect(table.getByRole('columnheader', { name: 'Vorname' })).toHaveAttribute(
    'aria-sort',
    'descending',
  );

  await user.click(screen.getByRole('button', { name: 'Exportieren' }));
  await user.click(screen.getByRole('menuitem', { name: 'PDF nach Verein' }));
  expect(postIds).toHaveBeenCalledWith('/api/competitions/c/pdf/starters', ['008', '004', '000'], {
    contestId: 'contest',
    target: '_blank',
  });
});

it('hides and shows columns', async () => {
  const { user, table } = await renderPage();
  expect(table.queryByRole('columnheader', { name: 'Ort' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Spalten' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Ort' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Jahrgang' }));
  await user.keyboard('{Escape}');
  expect(table.getByRole('columnheader', { name: 'Ort' })).toBeInTheDocument();
  expect(table.queryByRole('columnheader', { name: 'Jahrgang' })).not.toBeInTheDocument();
});

it('marks differences from the athlete and lists who is removed', async () => {
  const { user, table, rows } = await renderPage();
  expect(within(rows()[0]).getByText('Abweichend von den Stammdaten')).toBeInTheDocument();
  await user.click(table.getByRole('button', { name: 'Anna000 Muster entfernen' }));
  const dialog = within(screen.getByRole('alertdialog'));
  expect(dialog.getByText('Anna000 Muster, TV Buchs')).toBeInTheDocument();
});

it('shows a partial selection', async () => {
  const { user, table, rows } = await renderPage();
  const all = table.getByRole('checkbox', { name: /Alle gefilterten/ });
  await user.click(within(rows()[0]).getByRole('checkbox'));
  expect(all).toBePartiallyChecked();
  await user.click(all);
  expect(all).toBeChecked();
});

it('drops removed starters from the selection and moves the focus to the list', async () => {
  const { user, rows } = await renderPage();
  await user.click(within(rows()[0]).getByRole('checkbox'));
  await user.click(within(rows()[1]).getByRole('checkbox'));
  await user.click(within(rows()[0]).getByRole('button', { name: /entfernen/ }));
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Entfernen' }),
  );
  expect(await screen.findByText('1 Person ausgewählt')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('region', { name: 'Teilnehmende' })).toHaveFocus());
});

it('gives the focus back after assigning', async () => {
  const { user, rows } = await renderPage();
  await user.click(within(rows()[0]).getByRole('checkbox'));
  const assign = screen.getByRole('button', { name: 'Einteilen' });
  await user.click(assign);
  const dialog = within(screen.getByRole('dialog'));
  await user.selectOptions(dialog.getByLabelText('Abteilung'), 'd');
  await user.click(dialog.getByRole('button', { name: 'Einteilen' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(assign).toHaveFocus());
});

it('opens the starter of a link and drops it from the address', async () => {
  // Like a page opened from a bookmark: browsers give every page a key.
  const { user } = await renderPage({
    entries: [
      '/elsewhere',
      { pathname: '/', search: '?contest=contest&edit=003', key: 'k3y' } as never,
    ],
  });
  expect(screen.getByRole('dialog', { name: 'Anna003 Muster bearbeiten' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('address')).toHaveTextContent('/?contest=contest');
  await waitFor(() => expect(screen.getByTestId('address')).not.toHaveTextContent('edit'));
});

it('returns to the page with the link, when the link asks for it', async () => {
  const { user } = await renderPage({ entries: ['/lineups'] });
  await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
  await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('/lineups'));
});

it('stays after a plain link', async () => {
  const { user } = await renderPage({ entries: ['/lineups'], link: 'plain' });
  await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
  await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/$/));
});

it.each([
  ['an unknown starter', { entries: ['/?edit=nope'] }],
  ['viewers', { entries: ['/?edit=003'], canEdit: false }],
])('ignores the link for %s', async (_, options) => {
  await renderPage(options);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('lets the check-in edit the person and remove only', async () => {
  const { user, table, rows } = await renderPage({ canEdit: false, isCheckIn: true });
  for (const name of ['Exportieren', 'Importieren', 'Einteilen']) {
    expect(screen.queryByText(name)).not.toBeInTheDocument();
  }
  await user.click(within(rows()[0]).getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'Entfernen' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Einteilen' })).not.toBeInTheDocument();

  await user.click(table.getByText('Anna001'));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByLabelText('Vorname')).toBeInTheDocument();
  expect(dialog.queryByLabelText('Geschlecht')).not.toBeInTheDocument();
  expect(dialog.queryByLabelText('Kategorie')).not.toBeInTheDocument();
});

it('lets viewers look and export only', async () => {
  const { table } = await renderPage({ canEdit: false });
  expect(table.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(table.queryByRole('button', { name: /bearbeiten|entfernen/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Importieren' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Exportieren' })).toBeEnabled();
});
