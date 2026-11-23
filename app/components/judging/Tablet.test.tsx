import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { Tablet, type TabletData } from './Tablet';
import type { TabletSlot } from './types';

const LINK = 'link1';
const URL = '/api/judge/x/grades';

function createSlot(entryId: string, patch: Partial<TabletSlot> = {}): TabletSlot {
  return {
    entryId,
    starterId: entryId,
    contestId: 'c1',
    divisionId: 'd1',
    divisionNumber: 1,
    category: 'K5',
    sex: 'FEMALE',
    firstname: entryId,
    lastname: 'Frei',
    clubName: 'TV Chur',
    withdrawn: false,
    inputRule: { attempts: 1, aggregation: 'NONE' },
    precision: 2,
    grade: null,
    apparatus: 'reck',
    ...patch,
  };
}

const grade = (value: number, version = 1) => ({
  version,
  value,
  attempts: [],
  updatedAt: new Date(0),
});

function createData(slots: TabletSlot[], patch: Partial<TabletData> = {}): TabletData {
  return {
    status: 'JUDGING',
    currentRound: 0,
    divisions: [
      {
        id: 'd1',
        contestId: 'c1',
        category: 'K5',
        sex: 'FEMALE',
        number: 1,
        ground: 1,
        state: 'RUNNING',
        rounds: 2,
        round: 0,
        progress: { reck: 0 },
      },
    ],
    divisionIds: ['d1'],
    endedIds: [],
    rounds: [
      { round: 0, slots },
      { round: 1, slots: [] },
    ],
    loadedAt: 0,
    ...patch,
  };
}

let show: (data: TabletData) => void;

function setup(initial: TabletData) {
  let update = (_: TabletData) => {};
  const capture = (setData: typeof update) => (update = setData);

  function Page() {
    const [data, setData] = useState(initial);
    useEffect(() => void capture(setData), []);
    return (
      <main id="content">
        <Tablet linkId={LINK} url={URL} data={data} />
      </main>
    );
  }

  const Stub = createRoutesStub([{ path: '/', Component: Page }]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <Stub />
    </I18nextProvider>,
  );
  show = (data) => act(() => update(data));
}

const send = vi.fn<typeof fetch>();
const reply = (body: object) => Promise.resolve(Response.json(body));
const bodies = () =>
  send.mock.calls
    .filter(([url]) => url === URL)
    .map(([, init]) => JSON.parse(init!.body as string));
const unreachable = () => Promise.reject(new TypeError('Failed to fetch'));
/** The server saves everything. */
const saves: typeof fetch = (_, init) => {
  const { intent, grade: sent } = JSON.parse(init!.body as string);
  const saved = { version: 2, ...sent };
  return reply({ ok: true, savedAt: 1, grade: intent === 'save' ? saved : undefined });
};
const input = () => screen.getByLabelText<HTMLInputElement>('Note');
const heading = () => screen.getAllByRole('heading', { level: 2 })[0].textContent;
const click = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await act(() => vi.advanceTimersByTimeAsync(0));
};
const type = (value: string) => fireEvent.change(input(), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  send.mockReset();
  send.mockImplementation(saves);
  vi.stubGlobal('fetch', send);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('one starter at a time', () => {
  it('saves with next and waits for the answer', async () => {
    let answer = (_: Response) => {};
    send.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    setup(createData([createSlot('Anna'), createSlot('Bea')]));
    expect(heading()).toBe('Anna Frei');
    expect(screen.getByText('Danach: Bea Frei')).toBeVisible();
    type('9,25');
    await click('Weiter');
    expect(heading()).toBe('Anna Frei');
    const saved = { value: 9250, attempts: [], version: 1 };
    await act(async () => answer(Response.json({ ok: true, savedAt: 1, grade: saved })));
    expect(heading()).toBe('Bea Frei');
    expect(bodies()[0]).toEqual({
      intent: 'save',
      entryId: 'Anna',
      apparatus: 'reck',
      grade: { value: 9250, attempts: [] },
      version: null,
    });
  });

  describe('when the answer comes late', () => {
    let answer: () => Promise<void>;

    beforeEach(() => {
      let respond = (_: Response) => {};
      send.mockImplementation((url, init) =>
        url === URL ? new Promise((resolve) => (respond = resolve)) : saves(url, init),
      );
      answer = () =>
        act(async () => {
          const [, init] = send.mock.calls.filter(([url]) => url === URL).at(-1)!;
          respond(await saves(URL, init));
        });
    });

    const openFromList = (name: string) =>
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`${name} Frei`) }).at(-1)!);

    it('stays with the starter that was opened meanwhile', async () => {
      setup(createData(['Anna', 'Bea', 'Cleo', 'Dora'].map((id) => createSlot(id))));
      type('9.1');
      await click('Weiter');
      openFromList('Dora');
      type('8');
      await answer();
      expect(heading()).toBe('Dora Frei');
      expect(input()).toHaveValue('8');
      expect(input()).toHaveFocus();
    });

    it('stays when the same starter was opened again', async () => {
      setup(createData(['Anna', 'Bea'].map((id) => createSlot(id))));
      type('9.1');
      await click('Weiter');
      openFromList('Bea');
      openFromList('Anna');
      await answer();
      expect(heading()).toBe('Anna Frei');
    });

    it('stays with a starter of a confirmed round that was opened meanwhile', async () => {
      const anna = createSlot('Anna', { grade: grade(9000) });
      const data = createData([anna], { currentRound: 1 });
      data.rounds[1].slots = [createSlot('Bea'), createSlot('Cleo')];
      setup(data);
      type('9.1');
      await click('Weiter');
      await click('Alle Durchgänge');
      fireEvent.click(screen.getByRole('button', { name: /Anna Frei/ }));
      await answer();
      expect(heading()).toBe('Anna Frei');
    });

    it('moves on from a starter whose round was confirmed elsewhere', async () => {
      const slots = [createSlot('Anna')];
      setup(createData(slots));
      type('9.1');
      await click('Kontrolle');
      show(createData(slots, { currentRound: 1 }));
      expect(heading()).toBe('Anna Frei');
      await answer();
      expect(heading()).toBe('Pause');
    });
  });

  it('keeps the form with what is being typed when the round is confirmed elsewhere', () => {
    const next = createSlot('Bea');
    const before = createData([createSlot('Anna')]);
    before.rounds[1].slots = [next];
    setup(before);
    type('9');
    const field = input();
    show({ ...before, currentRound: 1 });
    expect(heading()).toBe('Anna Frei');
    expect(screen.getByText('Dieser Durchgang ist schon bestätigt.')).toBeVisible();
    expect(input()).toBe(field);
  });

  it('does not rewrite a value on the way to another one', async () => {
    const anna = createSlot('Anna', { grade: grade(9000) });
    setup(createData([anna, createSlot('Bea')]));
    fireEvent.click(screen.getAllByRole('button', { name: /Anna Frei/ })[0]);
    type('9');
    expect(input()).toHaveValue('9');
    show(createData([anna, createSlot('Bea')]));
    expect(input()).toHaveValue('9');
    // The same grade needs no saving.
    await click('Weiter');
    expect(heading()).toBe('Bea Frei');
    expect(bodies()).toEqual([]);
  });

  it('takes the focus with the starter that follows a save of a confirmed round', async () => {
    const before = createData([createSlot('Anna')]);
    before.rounds[1].slots = [createSlot('Bea')];
    setup(before);
    type('9.2');
    show({ ...before, currentRound: 1 });
    await click('Speichern');
    expect(heading()).toBe('Bea Frei');
    expect(input()).toHaveFocus();
  });

  it('puts the focus into the grade of a starter picked from all rounds', async () => {
    setup(createData([createSlot('Anna'), createSlot('Bea')]));
    await click('Alle Durchgänge');
    fireEvent.click(screen.getByRole('button', { name: /Bea Frei/ }));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(heading()).toBe('Bea Frei');
    expect(input()).toHaveFocus();
  });

  it('does not take the focus when another starter is shown by itself', () => {
    setup(createData([createSlot('Anna')]));
    type('9');
    show(createData([createSlot('Bea')]));
    expect(heading()).toBe('Bea Frei');
    expect(input()).not.toHaveFocus();
  });

  it.each([
    ['', 'Bitte eine Note eintragen.'],
    ['92', 'Die Note muss zwischen 0 und 10 liegen.'],
    ['abc', 'Das ist keine Zahl. Beispiel: 9.25'],
  ])('explains what is wrong with "%s"', async (value, message) => {
    setup(createData([createSlot('Anna'), createSlot('Bea')]));
    type(value);
    await click('Weiter');
    expect(screen.getByText(message)).toBeVisible();
    expect(heading()).toBe('Anna Frei');
    expect(send).not.toHaveBeenCalled();
  });

  it('computes the final grade of a vault while typing', () => {
    const inputRule = { attempts: 2, aggregation: 'AVG' } as const;
    setup(createData([createSlot('Anna', { inputRule })]));
    fireEvent.change(screen.getByLabelText('1. Versuch'), { target: { value: '9.1' } });
    fireEvent.change(screen.getByLabelText('2. Versuch'), { target: { value: '9.2' } });
    expect(screen.getByLabelText('Endnote (Durchschnitt)')).toHaveValue('9.15');
  });

  it('skips withdrawn starters and tells when somebody is withdrawn', async () => {
    const [anna, bea, cleo] = ['Anna', 'Bea', 'Cleo'].map((id) => createSlot(id));
    setup(createData([anna, bea, cleo]));
    type('9');
    show(createData([anna, { ...bea, withdrawn: true }, cleo]));
    expect(screen.getByText('Bea Frei wurde abgemeldet.')).toBeVisible();
    expect(input()).toHaveValue('9');
    await click('Weiter');
    expect(heading()).toBe('Cleo Frei');
    await click('Meldung schliessen: Bea Frei wurde abgemeldet.');
    expect(screen.queryByText('Bea Frei wurde abgemeldet.')).toBeNull();
  });
});

describe('a lost connection', () => {
  it('keeps the grade, lets the judge carry on and sends it again by itself', async () => {
    send.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    setup(createData([createSlot('Anna'), createSlot('Bea')]));
    type('9.1');
    await click('Weiter');
    expect(heading()).toBe('Anna Frei');
    expect(screen.getByText('Keine Antwort vom Server')).toBeVisible();
    expect(localStorage.getItem(`grades:${LINK}`)).toContain('9.1');

    await click('Trotzdem weiter');
    expect(heading()).toBe('Bea Frei');
    type('9.5');
    expect(screen.getByText('1 Note ist noch nicht gespeichert')).toBeVisible();

    send.mockImplementation(saves);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByText('1 Note ist noch nicht gespeichert')).toBeNull();
    expect(localStorage.getItem(`grades:${LINK}`)).not.toContain('Anna');
    // The other one was not submitted yet.
    expect(input()).toHaveValue('9.5');
  });

  it('sends the last input also when it is the saved grade again', async () => {
    send.mockImplementation(unreachable);
    setup(createData([createSlot('Anna', { grade: grade(8500, 3) }), createSlot('Bea')]));
    fireEvent.click(screen.getAllByRole('button', { name: /Anna Frei/ })[0]);
    type('9');
    await click('Weiter');
    type('8.5');
    expect(screen.getByText('Noch nicht gespeichert')).toBeVisible();
    send.mockImplementation(saves);
    await click('Weiter');
    expect(bodies()[1]).toMatchObject({ grade: { value: 8500 }, version: 3 });
    expect(heading()).toBe('Bea Frei');
  });

  it('is done when the data shows that the grade arrived after all', async () => {
    send.mockImplementation(unreachable);
    setup(createData([createSlot('Anna'), createSlot('Bea')]));
    type('9.1');
    await click('Weiter');
    show(createData([createSlot('Anna', { grade: grade(9100) }), createSlot('Bea')]));
    expect(screen.queryByText('Keine Antwort vom Server')).toBeNull();
    expect(screen.getByText('Gespeichert: 9.10')).toBeVisible();
  });

  it('asks when an earlier input arrived after all', async () => {
    send.mockImplementation(unreachable);
    setup(createData([createSlot('Anna'), createSlot('Bea')]));
    type('9.1');
    await click('Weiter');
    type('8.1');
    show(createData([createSlot('Anna', { grade: grade(9100) }), createSlot('Bea')]));
    expect(screen.getByText('Gespeichert ist 9.10. Deine Eingabe: 8.10.')).toBeVisible();
    send.mockImplementation(saves);
    await click('Meine Eingabe speichern');
    expect(bodies().at(-1)).toMatchObject({ grade: { value: 8100 }, version: 1 });
    expect(heading()).toBe('Bea Frei');
  });

  it('shows all attempts in the review, also a 0', async () => {
    const saved = { version: 1, value: 4500, attempts: [9000, 0], updatedAt: new Date(0) };
    setup(
      createData([
        createSlot('Anna', { grade: saved, inputRule: { attempts: 2, aggregation: 'AVG' } }),
      ]),
    );
    if (heading() !== 'Kontrolle') await click('Kontrolle');
    expect(screen.getByText('9.00 / 0.00')).toBeVisible();
    expect(screen.getAllByText('4.50').length).toBeGreaterThan(0);
  });

  it('shows what is not sent yet in the review', async () => {
    send.mockImplementation(unreachable);
    setup(createData([createSlot('Anna'), createSlot('Bea')]));
    type('9.1');
    await click('Weiter');
    await click('Trotzdem weiter');
    show(createData([createSlot('Anna'), createSlot('Bea', { withdrawn: true })]));
    await click('Kontrolle');
    expect(heading()).toBe('Kontrolle');
    expect(screen.getAllByText('9.10').length).toBeGreaterThan(0);
    expect(screen.getByText('1 Note ist noch nicht gesendet.')).toBeVisible();
    expect(screen.queryByText(/fehlt noch/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Durchgang bestätigen' })).toBeDisabled();
  });

  it('restores what was typed before a reload', () => {
    const data = createData([createSlot('Anna')]);
    setup(data);
    type('9.');
    cleanup();
    setup(data);
    expect(input()).toHaveValue('9.');
  });
});

describe('changes from elsewhere', () => {
  it('shows a grade saved by someone else', () => {
    setup(createData([createSlot('Anna')]));
    show(createData([createSlot('Anna', { grade: grade(9500) })]));
    expect(input()).toHaveValue('9.50');
    expect(heading()).toBe('Anna Frei');
  });

  it('asks before overwriting it', async () => {
    setup(createData([createSlot('Anna')]));
    type('9.1');
    show(createData([createSlot('Anna', { grade: grade(9500) })]));
    expect(screen.getByText('Gespeichert ist 9.50. Deine Eingabe: 9.10.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Kontrolle' })).toBeDisabled();
    await click('Gespeicherte übernehmen');
    expect(input()).toHaveValue('9.50');
    expect(bodies()).toEqual([]);
  });

  it('keeps the input when the division is stopped', async () => {
    const data = createData([createSlot('Anna')]);
    setup(data);
    type('9.1');
    show(
      createData([], {
        status: 'WAITING',
        currentRound: null,
        divisions: [],
        divisionIds: [],
        rounds: [],
      }),
    );
    expect(screen.getByText(/Abteilung 1 wurde gestoppt/)).toBeVisible();
    expect(screen.queryByText(/Anna Frei:/)).toBeNull();
    await click('Anzeigen');
    expect(screen.getByText(/Anna Frei:/)).toHaveTextContent('Anna Frei: 9.10');
    show(data);
    expect(input()).toHaveValue('9.1');
  });

  it('says nothing about a stop any more when the division runs again', () => {
    const data = createData([createSlot('Anna')]);
    const none = { divisions: [], divisionIds: [], rounds: [] };
    setup(data);
    show(createData([], { status: 'WAITING', currentRound: null, ...none }));
    show(data);
    expect(screen.queryByText(/wurde gestoppt/)).toBeNull();
  });

  it('asks about a conflict in a round that is already confirmed', async () => {
    setup(createData([createSlot('Anna')]));
    type('9.6');
    const saved = [createSlot('Anna', { grade: grade(9100) })];
    show(createData(saved, { currentRound: 1 }));
    // At the starter, as it was being typed, and above what comes next.
    expect(screen.getByText('Gespeichert ist 9.10. Deine Eingabe: 9.60.')).toBeVisible();
    await click('Zurück');
    expect(heading()).toBe('Pause');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Anna Frei: 9.60');
    expect(alert).toHaveTextContent('gespeichert ist 9.10');
    await click('Meine Eingabe speichern');
    expect(bodies()).toMatchObject([{ grade: { value: 9600 }, version: 1 }]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets the judge grade a starter that was added to a confirmed round', async () => {
    const anna = createSlot('Anna', { grade: grade(9000) });
    setup(createData([anna], { currentRound: 1 }));
    show(createData([anna, createSlot('Late')], { currentRound: 1 }));
    expect(screen.getByText(/Durchgang 1 ist schon bestätigt/)).toBeVisible();
    await click('Alle Durchgänge');
    expect(screen.getByText('Fehlt')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Late Frei/ }));
    expect(screen.getByText('Dieser Durchgang ist schon bestätigt.')).toBeVisible();
    type('8.8');
    await click('Speichern');
    expect(bodies()).toMatchObject([{ entryId: 'Late', grade: { value: 8800 } }]);
    expect(heading()).toBe('Pause');
  });

  it('is finished after the end and moves on with the next division', () => {
    const ended = createData([], {
      status: 'WAITING',
      currentRound: null,
      divisions: [],
      divisionIds: [],
      rounds: [],
      endedIds: ['d1'],
    });
    setup(createData([createSlot('Anna', { grade: grade(9500) })]));
    show(ended);
    expect(screen.getByText('Fertig')).toBeVisible();
    show(createData([createSlot('Bea')]));
    expect(heading()).toBe('Bea Frei');
  });
});

describe('the end of a round', () => {
  it('is reviewed, corrected and confirmed', async () => {
    const slots = ['Anna', 'Bea'].map((id) => createSlot(id, { grade: grade(9000) }));
    setup(createData(slots));
    expect(heading()).toBe('Kontrolle');
    fireEvent.click(screen.getAllByRole('button', { name: /Anna Frei/ })[0]);
    type('9.2');
    await click('Zurück zur Kontrolle');
    expect(heading()).toBe('Kontrolle');

    // A second tap must not confirm what follows.
    expect(screen.getByRole('button', { name: 'Durchgang bestätigen' })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await click('Durchgang bestätigen');
    expect(bodies().at(-1)).toEqual({
      intent: 'confirm',
      round: 0,
      divisionIds: ['d1'],
    });
    show(createData(slots, { currentRound: 1 }));
    expect(heading()).toBe('Pause');
  });

  it('cannot be confirmed while grades are missing', () => {
    const anna = createSlot('Anna', { grade: grade(9000) });
    setup(createData([anna]));
    show(createData([anna, createSlot('Bea')]));
    expect(screen.getByText('Es fehlt noch 1 Note.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Durchgang bestätigen' })).toBeDisabled();
  });

  it('names the grades of other apparatus that keep the division from ending', async () => {
    send.mockImplementation(() =>
      reply({
        ok: false,
        code: 'GRADES_MISSING',
        missing: [{ entryId: 'x', firstname: 'Xenia', lastname: 'Frei', apparatus: 'boden' }],
      }),
    );
    setup(createData([createSlot('Anna', { grade: grade(9000) })]));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await click('Durchgang bestätigen');
    expect(screen.getByRole('alert')).toHaveTextContent('Xenia Frei (Boden)');
    expect(screen.getByRole('alert')).toHaveTextContent('Wettkampfleitung');
    expect(screen.getByRole('button', { name: 'Durchgang bestätigen' })).toBeEnabled();
  });

  it('keeps a grade when the link was reset meanwhile', async () => {
    send.mockImplementation(() => Promise.resolve(new Response(null, { status: 403 })));
    setup(createData([createSlot('Anna')]));
    type('9.1');
    await click('Kontrolle');
    expect(localStorage.getItem(`grades:${LINK}`)).toContain('9.1');
  });

  it('tells when it could not be confirmed', async () => {
    send.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    setup(createData([]));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await click('Durchgang bestätigen');
    expect(screen.getByRole('alert')).toHaveTextContent('Keine Antwort vom Server');
  });
});
