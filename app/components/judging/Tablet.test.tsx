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

const grade = (value: number) => ({ value, attempts: [], updatedAt: new Date(0) });

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
    return <Tablet linkId={LINK} url={URL} data={data} status="open" />;
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
  send.mockImplementation(() => reply({ ok: true, savedAt: 1 }));
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
    await act(async () => answer(Response.json({ ok: true, savedAt: 1 })));
    expect(heading()).toBe('Bea Frei');
    expect(JSON.parse(send.mock.calls[0][1]!.body as string)).toEqual({
      intent: 'save',
      entryId: 'Anna',
      apparatus: 'reck',
      grade: { value: 9250, attempts: [] },
      previous: null,
    });
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
    expect(screen.getByText('Nicht gespeichert: keine Verbindung')).toBeVisible();
    expect(localStorage.getItem(`grade:${LINK}:reck:Anna`)).toContain('9.1');

    await click('Trotzdem weiter');
    expect(heading()).toBe('Bea Frei');
    type('9.5');
    expect(screen.getByText('1 Note ist noch nicht gespeichert')).toBeVisible();

    send.mockImplementation(() => reply({ ok: true, savedAt: 1 }));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByText('1 Note ist noch nicht gespeichert')).toBeNull();
    expect(localStorage.getItem(`grade:${LINK}:reck:Anna`)).toBeNull();
    // The other one was not submitted yet.
    expect(input()).toHaveValue('9.5');
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
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the input when the division is stopped', () => {
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
    expect(screen.getByText(/Anna Frei:/)).toHaveTextContent('Anna Frei: 9.10');
    show(data);
    expect(input()).toHaveValue('9.1');
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
    expect(JSON.parse(send.mock.calls.at(-1)![1]!.body as string)).toEqual({
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
    expect(localStorage.getItem(`grade:${LINK}:reck:Anna`)).toContain('9.1');
  });

  it('tells when it could not be confirmed', async () => {
    send.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    setup(createData([]));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await click('Durchgang bestätigen');
    expect(screen.getByRole('alert')).toHaveTextContent('Nicht bestätigt: keine Verbindung');
  });
});
