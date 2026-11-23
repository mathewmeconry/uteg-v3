import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub, data } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContestOptions } from '~/lib/contestOptions.server';
import { createI18n } from '~/lib/i18n';
import { AssignDialog } from './AssignDialog';
import { ImportReview } from './ImportReview';
import { reviewReducer } from './importReview';
import { RemoveDialog } from './RemoveDialog';
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
const CLUBS = [CLUB, { id: '01M845', name: 'Geräteriege', location: 'Zürich' }];
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
function renderPage(children: ReactNode, result: unknown = { ok: true }) {
  const submitted = vi.fn();
  const Stub = createRoutesStub([
    {
      path: '/',
      id: 'root',
      Component: () => <I18nextProvider i18n={createI18n('de')}>{children}</I18nextProvider>,
      action: async ({ request }) => {
        submitted([...(await request.formData())]);
        return result;
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

function renderStarterDialog(starter?: StarterRow, result?: unknown) {
  const onClose = vi.fn();
  const page = renderPage(
    <StarterDialog
      competitionId="c"
      starter={starter}
      options={OPTIONS}
      clubs={CLUBS}
      startingIds={new Set(['athlete-anna'])}
      onClose={onClose}
    />,
    result,
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
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (!url.endsWith('/clubs')) return Response.json({ athletes: [suggestion] });
    const fields = Object.fromEntries(init.body as URLSearchParams);
    if (!fields.location) {
      return Response.json({ errors: { location: 'Bitte ausfüllen' } }, { status: 400 });
    }
    return Response.json({ club: { id: 'new', ...fields } });
  });

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

  it('keeps a new club that could not be saved', async () => {
    const user = userEvent.setup();
    renderStarterDialog();
    await user.click(screen.getByLabelText('Verein'));
    await user.click(screen.getByRole('button', { name: 'Neuen Verein erfassen' }));
    await user.type(screen.getByLabelText('Name des Vereins'), 'TV Neu{Enter}');
    expect(await screen.findByText('Bitte ausfüllen')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.type(screen.getByLabelText('Ort'), 'Bern{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Keine Verbindung/);
    expect(screen.getByLabelText('Name des Vereins')).toHaveValue('TV Neu');
  });

  it('opens the form for a new club with Enter, instead of picking a club', async () => {
    const user = userEvent.setup();
    renderStarterDialog();
    await user.click(screen.getByLabelText('Verein'));
    await user.type(screen.getByRole('combobox', { name: 'Verein suchen' }), 'Chur');
    screen.getByRole('button', { name: '«Chur» neu erfassen' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Name des Vereins')).toHaveValue('Chur');
    expect(screen.queryByText('TV Chur, Chur')).not.toBeInTheDocument();
  });

  it('searches clubs by name and place, not by id, ignoring accents', async () => {
    const user = userEvent.setup();
    renderStarterDialog();
    await user.click(screen.getByLabelText('Verein'));
    const search = screen.getByRole('combobox', { name: 'Verein suchen' });
    expect(screen.getByRole('listbox', { name: 'Verein' })).toBeInTheDocument();
    for (const [text, count] of [
      ['01M', 0],
      ['gerateriege zur', 1],
      ['GERÄ', 1],
      ['tc', 0],
    ] as const) {
      await user.clear(search);
      await user.type(search, text);
      const list = within(screen.getByRole('listbox', { name: 'Verein' }));
      expect(list.queryAllByRole('option')).toHaveLength(count);
    }
  });

  it('only picks a suggestion that is marked in the current list', async () => {
    const user = userEvent.setup();
    renderStarterDialog();
    const firstname = screen.getByRole('combobox', { name: 'Vorname' });
    await user.type(firstname, 'Ann');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: /Anna/ })).toHaveAttribute('aria-selected', 'true');

    await user.type(firstname, 'a');
    const option = await screen.findByRole('option', { name: /Anna/ });
    expect(option).toHaveAttribute('aria-selected', 'false');
    await user.type(firstname, '{Backspace}');
    expect(await screen.findByRole('option', { name: /Anna/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it.each([
    ['network', /Keine Verbindung/],
    ['notFound', /nicht mehr/],
    ['server', /schiefgelaufen/],
  ])('keeps what was typed after a failure (%s)', async (failed, message) => {
    const user = userEvent.setup();
    const { onClose } = renderStarterDialog(ANNA, data({ failed }, 500));
    await user.type(screen.getByLabelText('Vorname'), 'belle');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('Vorname')).toHaveValue('Annabelle');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focuses the first invalid field', async () => {
    const user = userEvent.setup();
    const errors = { birthYear: 'Ungültiger Wert', clubId: 'Bitte ausfüllen' };
    renderStarterDialog(undefined, data({ errors }, 400));
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => expect(screen.getByLabelText('Jahrgang')).toHaveFocus());
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

it.each([
  ['Nicht ändern', {}],
  ['Kein Startgerät', { lineupId: null }],
])('AssignDialog sends the start apparatus "%s"', async (choice, sent) => {
  const user = userEvent.setup();
  const { submitted, fields } = renderPage(
    <AssignDialog starters={[ANNA]} options={OPTIONS} onClose={() => {}} />,
  );
  const apparatus = screen.getByLabelText('Startgerät');
  expect(apparatus).toHaveDisplayValue('Nicht ändern');
  await user.selectOptions(screen.getByLabelText('Abteilung'), 'f1');
  await user.selectOptions(apparatus, choice);
  await user.click(screen.getByRole('button', { name: 'Einteilen' }));
  await waitFor(() => expect(submitted).toHaveBeenCalled());
  expect(JSON.parse(fields().assignments)).toEqual([
    { entryIds: ['entry-anna'], divisionId: 'f1', ...sent },
  ]);
});

it('AssignDialog clears the start apparatus of groups that change the division, and says so', async () => {
  const user = userEvent.setup();
  const moving = { ...ANNA, id: 'lea', entryId: 'lea', divisionId: 'f2', lineupId: 'f2-boden' };
  const { submitted, fields } = renderPage(
    <AssignDialog starters={[ANNA, moving]} options={OPTIONS} onClose={() => {}} />,
  );
  await user.selectOptions(screen.getByLabelText('Abteilung'), 'f1');
  const apparatus = screen.getByLabelText('Startgerät');
  expect(within(apparatus).queryByRole('option', { name: 'Nicht ändern' })).toBeNull();
  expect(apparatus).toHaveDisplayValue('Kein Startgerät');
  expect(apparatus).toHaveAccessibleDescription(/bisherige Startgerät wird entfernt/);
  await user.selectOptions(apparatus, 'Reck');
  expect(apparatus).not.toHaveAccessibleDescription();
  await user.selectOptions(apparatus, 'Kein Startgerät');
  await user.click(screen.getByRole('button', { name: 'Einteilen' }));
  await waitFor(() => expect(submitted).toHaveBeenCalled());
  expect(JSON.parse(fields().assignments)).toMatchObject([{ lineupId: null }]);
});

it('RemoveDialog shows errors and stays open', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  renderPage(
    <RemoveDialog starters={[ANNA]} onClose={onClose} onRemoved={() => {}} />,
    data({ error: 'Das geht nicht.' }, 400),
  );
  await user.click(screen.getByRole('button', { name: 'Entfernen' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Das geht nicht.');
  expect(onClose).not.toHaveBeenCalled();
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
    expect(sex).toHaveAccessibleDescription('Bitte ausfüllen');
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
    // The focus moves to the row that took its place, and to the empty list at the end.
    const remove = screen.getByRole('button', { name: 'Zeile 1 entfernen' });
    expect(remove).toHaveFocus();
    await user.click(remove);
    expect(screen.getByText('Keine Zeilen mehr übrig.')).toBeInTheDocument();
    expect(document.body).not.toHaveFocus();
  });
});
