import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub, Outlet } from 'react-router';
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
    lineupId: null,
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

async function renderPage({ canEdit = true } = {}) {
  const Stub = createRoutesStub([
    {
      id: 'routes/secured/competition/layout',
      path: '/',
      loader: () => ({
        competition: { id: 'c' },
        contests: [{ id: 'contest', name: 'EGT' }],
        canEdit,
      }),
      Component: () => (
        <I18nextProvider i18n={createI18n('de')}>
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
              divisions: [],
            },
          }),
          // The props are typed for the real route.
          Component: Starters as never,
        },
      ],
    },
  ]);
  render(<Stub />);
  const table = within(await screen.findByRole('table'));
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

it('lets viewers look and export only', async () => {
  const { table } = await renderPage({ canEdit: false });
  expect(table.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(table.queryByRole('button', { name: /bearbeiten|entfernen/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Importieren' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Exportieren' })).toBeEnabled();
});
