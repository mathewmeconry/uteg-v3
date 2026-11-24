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
  clubName: 'TV Chur',
  category: 'K5',
  division: null,
  apparatus: null,
  ...patch,
});
const INDEX: SearchIndex = {
  starters: [
    person('a', 'Zoé Ammann', { division: DIVISION, apparatus: 'boden' }),
    person('b', 'Bea Ammann'),
    person('c', 'Cleo Frei'),
  ],
  divisions: [DIVISION, { ...DIVISION, id: 'd2', number: 2, state: 'PENDING' }],
};

function setup(canEdit = true) {
  function Place() {
    const { pathname, search } = useLocation();
    return <p data-testid="place">{pathname + search}</p>;
  }
  const Stub = createRoutesStub([
    {
      id: 'routes/secured/competition/layout',
      path: '/',
      loader: () => ({ competition: { id: 'c' }, canEdit }),
      HydrateFallback: () => null,
      Component: () => (
        <I18nextProvider i18n={createI18n('de')}>
          <CompetitionSearch pages={[{ to: '/pages', label: 'Tablets', icon: LayersIcon }]} />
          <Outlet />
        </I18nextProvider>
      ),
      children: [{ path: '*', Component: Place }],
    },
    { path: '/api/competitions/c/search', loader: () => INDEX },
  ]);
  render(<Stub initialEntries={['/start']} />);
  return userEvent.setup();
}

const options = () => screen.getAllByRole('option').map((option) => option.textContent);
const place = () => screen.getByTestId('place').textContent;

beforeEach(() => {
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

async function open(canEdit?: boolean) {
  const user = setup(canEdit);
  await screen.findByTestId('place');
  await user.keyboard('{Control>}k{/Control}');
  // Without a search what runs, and the pages.
  expect(await screen.findByRole('option', { name: /K5 Weiblich, Abteilung 1/ })).toBeVisible();
  return user;
}

it('finds people without their accents and says where they are', async () => {
  const user = await open();
  expect(options()).toHaveLength(2);
  await user.keyboard('zoe amm');
  expect(options()).toEqual(['Zoé AmmannTV Chur, K5 Weiblich, Abteilung 1Jetzt: Boden']);
  await user.keyboard('{Enter}');
  expect(place()).toBe('/competitions/c/contests/k/divisions/d1/grading');
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
  expect(place()).toBe('/competitions/c/starters');
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
