import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayersIcon } from 'lucide-react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub, Outlet, useLocation } from 'react-router';
import { createI18n } from '~/lib/i18n';
import type { SearchIndex } from '~/lib/searchIndex.server';
import { CompetitionSearch } from './CompetitionSearch';

const DIVISION = {
  id: 'd1',
  contestId: 'k',
  category: 'K5',
  sex: 'FEMALE',
  number: 1,
  ground: 1,
  state: 'RUNNING',
} as const;
const person = (id: string, name: string, patch: object = {}) => ({
  id,
  name,
  sex: 'FEMALE' as const,
  contestId: 'k',
  clubName: 'TV Chur',
  category: 'K5',
  division: null,
  ...patch,
});
const INDEX: SearchIndex = {
  starters: [
    person('a', 'Zoé Ammann', { division: DIVISION }),
    person('b', 'Bea Ammann'),
    person('c', 'Cleo Frei'),
  ],
  clubs: [{ id: 'chur', name: 'TV Chur', location: 'Chur' }],
  divisions: [DIVISION, { ...DIVISION, id: 'd2', number: 2, state: 'PENDING' }],
};

const RANKING = {
  to: '/competitions/c/contests/k/ranking',
  label: 'Rangliste',
  icon: LayersIcon,
};

function setup(canEdit = true, contests = [{ id: 'k', name: 'EGT' }]) {
  const pages = [
    { to: '/pages', label: 'Tablets', icon: LayersIcon },
    ...(contests.length > 1 ? [RANKING] : []),
  ];
  function Place() {
    const { pathname, search } = useLocation();
    return <p data-testid="place">{pathname + search}</p>;
  }
  const Stub = createRoutesStub([
    {
      id: 'routes/secured/competition/layout',
      path: '/',
      loader: () => ({ competition: { id: 'c' }, contests, canEdit }),
      HydrateFallback: () => null,
      Component: () => (
        <I18nextProvider i18n={createI18n('de')}>
          <CompetitionSearch pages={pages} />
          <Outlet />
        </I18nextProvider>
      ),
      children: [{ path: '*', Component: Place }],
    },
  ]);
  render(<Stub initialEntries={['/start']} />);
  return userEvent.setup();
}

const options = () => screen.getAllByRole('option').map((option) => option.textContent);
const place = () => screen.getByTestId('place').textContent;

const load = vi.fn<typeof fetch>();

beforeEach(() => {
  load.mockReset();
  load.mockImplementation(async () => Response.json(INDEX));
  vi.stubGlobal('fetch', load);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function open(...options: Parameters<typeof setup>) {
  const user = setup(...options);
  await screen.findByTestId('place');
  await user.keyboard('{Control>}k{/Control}');
  // Without a search what runs, and the pages.
  expect(await screen.findByRole('option', { name: /K5 Weiblich, Abteilung 1/ })).toBeVisible();
  return user;
}

it('finds people without their accents', async () => {
  const user = await open();
  expect(options()).toHaveLength(2);
  await user.keyboard('zoe amm');
  expect(options()).toEqual(['Zoé AmmannTV Chur, K5 Weiblich, Abteilung 1']);
  await user.keyboard('{Enter}');
  expect(place()).toBe('/competitions/c/starters?edit=a');
});

it('finds people only by their name', async () => {
  const user = await open();
  await user.keyboard('k5');
  expect(options()).toEqual([
    'K5 Weiblich, Abteilung 1Wettkampfplatz 1, Läuft',
    'K5 Weiblich, Abteilung 2Wettkampfplatz 1, Geplant',
  ]);
});

it('opens the starters of a club', async () => {
  const user = await open();
  await user.keyboard('tv chur');
  expect(options()).toEqual(['TV ChurChur']);
  await user.keyboard('{Enter}');
  expect(place()).toBe('/competitions/c/starters?club=chur');
});

it('opens the first result with Enter, also after going through others', async () => {
  const user = await open();
  await user.keyboard('{ArrowDown}{ArrowDown}');
  await user.keyboard('ammann');
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Zoé Ammann');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(place()).toBe('/competitions/c/starters?edit=b');
});

it('does not send viewers to a form', async () => {
  const user = await open(false);
  await user.keyboard('bea{Enter}');
  expect(place()).toBe('/competitions/c/starters?starter=b');
});

it('says which contest a page belongs to, when there are several', async () => {
  const user = await open(true, [
    { id: 'k', name: 'EGT' },
    { id: 'k2', name: 'Final' },
  ]);
  await user.keyboard('rangliste');
  expect(options()).toEqual(['Rangliste, EGT']);
  await user.clear(screen.getByRole('combobox'));
  await user.keyboard('tabl');
  expect(options()).toEqual(['Tablets']);
});

it('keeps the page when it cannot load, and gives the focus back', async () => {
  load.mockRejectedValue(new TypeError('offline'));
  const user = setup();
  await screen.findByTestId('place');
  await user.click(screen.getByRole('button', { name: 'Suchen' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Keine Verbindung');
  // Pages are known anyway.
  expect(options()).toEqual(['Tablets']);
  await user.keyboard('{Escape}');
  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Suchen' })).toHaveFocus());
  expect(place()).toBe('/start');
});

it('finds divisions and pages, and says when there is nothing', async () => {
  const user = await open();
  await user.keyboard('abteilung 2');
  expect(options()).toEqual(['K5 Weiblich, Abteilung 2Wettkampfplatz 1, Geplant']);
  await user.clear(screen.getByRole('combobox'));
  await user.keyboard('tabl');
  expect(options()).toEqual(['Tablets']);
  await user.keyboard('xyz');
  expect(screen.getByText('Nichts gefunden')).toBeVisible();
});
