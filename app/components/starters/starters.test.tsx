import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContestOptions } from '~/lib/contestOptions.server';
import { createI18n } from '~/lib/i18n';
import { AssignDialog } from './AssignDialog';
import { ImportReview } from './ImportReview';
import { reviewReducer } from './importReview';
import { StarterDialog } from './StarterDialog';
import type { StarterRow } from './starterRow';

const lineups = (division: string) => [
  { id: `${division}-reck`, apparatus: 'reck' },
  { id: `${division}-boden`, apparatus: 'boden' },
];
const OPTIONS: ContestOptions = {
  id: 'contest',
  name: 'EGT',
  categories: { FEMALE: ['K5', 'KD'], MALE: ['K5', 'KH'] },
  apparatus: ['reck', 'boden'],
  divisions: [
    { id: 'f1', category: 'K5', sex: 'FEMALE', number: 1, lineups: lineups('f1') },
    { id: 'm1', category: 'K5', sex: 'MALE', number: 1, lineups: lineups('m1') },
  ],
};
const CLUB = { id: 'chur', name: 'TV Chur', location: 'Chur' };
const ANNA: StarterRow = {
  id: 'anna',
  firstname: 'Anna',
  lastname: 'Muster',
  birthYear: 2010,
  sex: 'FEMALE',
  club: CLUB,
  stvId: null,
  athleteId: 'athlete-anna',
  athlete: { firstname: 'Anna', lastname: 'Muster', birthYear: 2010, sex: 'FEMALE' },
  differs: false,
  entryId: 'entry-anna',
  category: 'K5',
  divisionId: 'f1',
  divisionNumber: 1,
  lineupId: 'f1-boden',
  startApparatus: 'boden',
};

/** Renders with the routes the dialogs post to. */
function renderPage(children: ReactNode) {
  const submitted = vi.fn();
  const Stub = createRoutesStub([
    {
      path: '/',
      id: 'root',
      Component: () => <I18nextProvider i18n={createI18n('de')}>{children}</I18nextProvider>,
      action: async ({ request }) => {
        submitted([...(await request.formData())]);
        return { ok: true };
      },
    },
    {
      path: '/api/competitions/:id/clubs',
      action: async ({ request }) => {
        const form = await request.formData();
        const club = { id: 'new', name: form.get('name'), location: form.get('location') };
        return { club, errors: null };
      },
    },
  ]);
  render(<Stub initialEntries={['/']} />);
  return { submitted, fields: () => Object.fromEntries(submitted.mock.calls[0][0]) };
}

beforeEach(() => {
  // Not part of jsdom, used by the combobox.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});
afterEach(() => vi.unstubAllGlobals());

function renderStarterDialog(starter?: StarterRow) {
  const onClose = vi.fn();
  const page = renderPage(
    <StarterDialog
      competitionId="c"
      starter={starter}
      options={OPTIONS}
      clubs={[CLUB]}
      startingIds={new Set(['athlete-anna'])}
      onClose={onClose}
    />,
  );
  return { ...page, onClose };
}

describe('StarterDialog', () => {
  const suggestion = {
    athleteId: 'athlete-anna',
    stvId: '4711',
    firstname: 'Anna',
    lastname: 'Muster',
    birthYear: 2010,
    sex: 'FEMALE',
    club: CLUB,
  };
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ athletes: [suggestion] }),
  );

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('fills in a suggested athlete, with the keyboard', async () => {
    const user = userEvent.setup();
    const { fields, onClose } = renderStarterDialog();
    const firstname = screen.getByRole('combobox', { name: 'Vorname' });
    await user.type(firstname, 'Ann');
    expect(await screen.findByRole('option', { name: /Anna Muster/ })).toHaveTextContent(
      'nimmt bereits teil',
    );
    expect(String(fetchMock.mock.calls[0][1].body)).toBe('query=Ann');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(firstname).toHaveValue('Anna');
    expect(screen.getByLabelText('STV-ID')).toHaveValue('4711');
    expect(screen.getByLabelText('Jahrgang')).toHaveValue('2010');
    expect(screen.getByLabelText('Verein')).toHaveTextContent('TV Chur');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(fields()).toMatchObject({
      intent: 'create',
      athleteId: 'athlete-anna',
      stvId: '4711',
      sex: 'FEMALE',
      clubId: 'chur',
      contestId: 'contest',
    });
  });

  it('forgets the suggested athlete when a value is changed', async () => {
    const user = userEvent.setup();
    const { submitted, fields } = renderStarterDialog();
    await user.type(screen.getByLabelText('STV-ID'), '47');
    await user.click(await screen.findByRole('option', { name: /Anna Muster/ }));
    await user.type(screen.getByLabelText('Nachname'), '-Frei');
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => expect(submitted).toHaveBeenCalled());
    expect(fields()).toMatchObject({ lastname: 'Muster-Frei' });
    expect(fields()).not.toHaveProperty('athleteId');
  });

  it('closes the suggestions with Escape, not the dialog', async () => {
    const user = userEvent.setup();
    const { onClose } = renderStarterDialog();
    await user.type(screen.getByRole('combobox', { name: 'Nachname' }), 'Mus');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a club on the way', async () => {
    const user = userEvent.setup();
    const { submitted, fields } = renderStarterDialog();
    await user.click(screen.getByLabelText('Verein'));
    await user.type(screen.getByPlaceholderText('Verein suchen'), 'TV Neu');
    await user.click(screen.getByRole('button', { name: '«TV Neu» neu erfassen' }));
    expect(screen.getByLabelText('Name des Vereins')).toHaveValue('TV Neu');
    await user.type(screen.getByLabelText('Ort'), 'Bern{Enter}');
    await waitFor(() => expect(screen.getByLabelText('Verein')).toHaveTextContent('TV Neu, Bern'));
    expect(submitted).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => expect(submitted).toHaveBeenCalled());
    expect(fields()).toMatchObject({ clubId: 'new' });
  });

  it('edits with the athlete left alone by default', async () => {
    const user = userEvent.setup();
    const { submitted, fields } = renderStarterDialog(ANNA);
    expect(screen.getByRole('checkbox', { name: /Stammdaten/ })).not.toBeChecked();
    expect(screen.queryByText(/^Stammdaten: /)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Vorname'), 'belle');
    expect(screen.getByText('Stammdaten: Anna')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(submitted).toHaveBeenCalled());
    expect(fields()).toMatchObject({
      intent: 'update',
      starterId: 'anna',
      firstname: 'Annabelle',
      category: 'K5',
      divisionId: 'f1',
      lineupId: 'f1-boden',
    });
    expect(fields()).not.toHaveProperty('updateAthlete');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers only divisions and apparatus that fit', async () => {
    const user = userEvent.setup();
    renderStarterDialog(ANNA);
    const division = screen.getByLabelText('Abteilung');
    const apparatus = screen.getByLabelText('Startgerät');
    expect(division).toHaveValue('f1');
    expect(apparatus).toHaveValue('f1-boden');

    await user.selectOptions(screen.getByLabelText('Geschlecht'), 'MALE');
    expect(division).toHaveValue('');
    expect(apparatus).toBeDisabled();
    await user.selectOptions(division, 'm1');
    expect(
      within(apparatus)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Kein Startgerät', 'Reck', 'Boden']);
    await user.selectOptions(screen.getByLabelText('Kategorie'), 'KH');
    expect(division).toBeDisabled();
  });
});

it('AssignDialog groups by category and sex and sends only the chosen groups', async () => {
  const user = userEvent.setup();
  const starters = [
    ANNA,
    { ...ANNA, id: 'lea', entryId: 'entry-lea' },
    { ...ANNA, id: 'jan', entryId: 'entry-jan', sex: 'MALE' as const },
    { ...ANNA, id: 'kh', entryId: 'entry-kh', sex: 'MALE' as const, category: 'KH' },
    { ...ANNA, id: 'none', entryId: 'entry-none', category: null },
  ];
  const { submitted, fields } = renderPage(
    <AssignDialog starters={starters} options={OPTIONS} onClose={() => {}} />,
  );
  expect(screen.getByText('1 Person ohne Kategorie wird nicht eingeteilt.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Einteilen' })).toBeDisabled();
  expect(
    within(screen.getByRole('group', { name: /KH · Männlich/ })).getByText(/noch keine Abteilung/),
  ).toBeInTheDocument();

  const group = within(screen.getByRole('group', { name: /K5 · Weiblich \(2\)/ }));
  await user.selectOptions(group.getByLabelText('Abteilung'), 'f1');
  await user.selectOptions(group.getByLabelText('Startgerät'), 'f1-reck');
  await user.click(screen.getByRole('button', { name: 'Einteilen' }));
  await waitFor(() => expect(submitted).toHaveBeenCalled());
  expect(JSON.parse(fields().assignments)).toEqual([
    { entryIds: ['entry-anna', 'entry-lea'], divisionId: 'f1', lineupId: 'f1-reck' },
  ]);
});

describe('ImportReview', () => {
  function Review() {
    const [rows, dispatch] = useReducer(
      reviewReducer,
      reviewReducer([], {
        type: 'load',
        starters: [
          {
            stvId: null,
            firstname: 'Muster',
            lastname: 'Anna',
            birthYear: 2010,
            sex: undefined,
            category: 'K5',
            divisionNumber: 1,
          },
          {
            stvId: null,
            firstname: 'Lea',
            lastname: 'Frei',
            birthYear: 2011,
            sex: 'FEMALE',
            category: 'K5',
            divisionNumber: 7,
          },
        ],
      }),
    );
    return <ImportReview rows={rows} options={OPTIONS} dispatch={dispatch} />;
  }

  it('requires the sex, warns about divisions, swaps and removes', async () => {
    const user = userEvent.setup();
    renderPage(<Review />);
    const sex = screen.getByLabelText('Geschlecht, Zeile 1');
    expect(sex).toBeInvalid();
    expect(sex).toHaveValue('');
    expect(screen.getAllByText(/Diese Abteilung gibt es nicht/)).toHaveLength(2);

    await user.selectOptions(sex, 'FEMALE');
    expect(sex).toBeValid();
    expect(screen.getAllByText(/Diese Abteilung gibt es nicht/)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Nachname von Zeile 1 tauschen/ }));
    expect(screen.getByLabelText('Vorname, Zeile 1')).toHaveValue('Anna');
    await user.clear(screen.getByLabelText('Vorname, Zeile 1'));
    expect(screen.getByLabelText('Vorname, Zeile 1')).toBeInvalid();

    await user.click(screen.getByRole('button', { name: 'Zeile 1 entfernen' }));
    expect(screen.getByLabelText('Vorname, Zeile 1')).toHaveValue('Lea');
    expect(screen.queryByLabelText('Vorname, Zeile 2')).not.toBeInTheDocument();
  });
});
