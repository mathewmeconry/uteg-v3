import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import type { TabletSlot } from '~/components/judging/types';
import { createI18n } from '~/lib/i18n';
import { RoundBoard } from './RoundBoard';
import { useGradeDrafts } from './useGradeDrafts';

const URL = '/grades';
const GRADE = { version: 1, value: 9000, attempts: [], updatedAt: new Date(0) };

function slot(firstname: string, apparatus: string, patch: Partial<TabletSlot> = {}): TabletSlot {
  return {
    entryId: firstname,
    starterId: firstname,
    contestId: 'c1',
    divisionId: 'd1',
    divisionNumber: 1,
    category: 'K5',
    sex: 'FEMALE',
    firstname,
    lastname: 'Frei',
    clubName: 'TV Chur',
    withdrawn: false,
    inputRule: { attempts: 1, aggregation: 'NONE' },
    precision: 2,
    grade: null,
    apparatus,
    ...patch,
  };
}

/** Two rounds on two apparatus, who started first is last in the second round. */
function createApparatus(
  currentRounds: { reck: number | null; boden: number | null },
  patch: Partial<TabletSlot> = {},
) {
  return [
    {
      apparatus: 'reck',
      currentRound: currentRounds.reck,
      divisionIds: ['d1'],
      rounds: [
        { round: 0, slots: [slot('Anna', 'reck', patch), slot('Bea', 'reck', patch)] },
        { round: 1, slots: [] },
      ],
    },
    {
      apparatus: 'boden',
      currentRound: currentRounds.boden,
      divisionIds: ['d1'],
      rounds: [
        { round: 0, slots: [] },
        { round: 1, slots: [slot('Bea', 'boden'), slot('Anna', 'boden')] },
      ],
    },
  ];
}

let show: (apparatus: ReturnType<typeof createApparatus>) => void;

function setup(initial = createApparatus({ reck: 0, boden: 0 }), canEdit = true) {
  const capture = (set: (next: ReturnType<typeof createApparatus>) => void) => {
    show = (next) => act(() => set(next));
  };
  function Page() {
    const [apparatus, setApparatus] = useState(initial);
    const drafts = useGradeDrafts({ url: URL, storageKey: 'test', loadedAt: 0 });
    capture(setApparatus);
    return <RoundBoard ground={1} apparatus={apparatus} drafts={drafts} canEdit={canEdit} />;
  }
  const Stub = createRoutesStub([{ path: '/', Component: Page }]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <Stub />
    </I18nextProvider>,
  );
  return userEvent.setup();
}

const card = (name: string) => within(screen.getByRole('region', { name }));
const names = (name: string) =>
  card(name)
    .queryAllByRole('listitem')
    .map((item) => /(Anna|Bea) Frei/.exec(item.textContent)?.[1]);
const round = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', async () => new Response('ok'));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('lists the current round of each apparatus in starting order', () => {
  setup(createApparatus({ reck: 0, boden: 1 }));
  expect(names('Reck')).toEqual(['Anna', 'Bea']);
  expect(names('Boden')).toEqual(['Bea', 'Anna']);
  expect(card('Reck').getByText('Durchgang 1')).toBeVisible();
  expect(card('Boden').getByText('Durchgang 2 folgt')).toBeVisible();
});

it('shows a chosen round on every apparatus, until the current one is chosen again', async () => {
  const user = setup();
  await user.click(round('Durchgang 2'));
  expect(names('Reck')).toEqual([]);
  expect(names('Boden')).toEqual(['Bea', 'Anna']);
  show(createApparatus({ reck: 1, boden: 0 }));
  expect(card('Boden').getByText('Durchgang 2')).toBeVisible();
  await user.click(round('Aktuell'));
  expect(card('Boden').getByText('Durchgang 1')).toBeVisible();
});

it('marks who is next in the current round', async () => {
  const user = setup(createApparatus({ reck: 0, boden: 0 }));
  const next = () => screen.queryAllByRole('listitem', { current: 'step' });
  expect(next().map((item) => item.textContent)).toEqual([expect.stringContaining('Anna')]);
  await user.click(round('Durchgang 2'));
  expect(next()).toEqual([]);
});

it('keeps a round that is being typed in', async () => {
  const user = setup();
  await user.type(card('Reck').getByLabelText('Note Anna Frei'), '9');
  show(createApparatus({ reck: 1, boden: 1 }));
  expect(names('Reck')).toEqual(['Anna', 'Bea']);
  expect(names('Boden')).toEqual(['Bea', 'Anna']);
});

it('tells about inputs in a round that is not shown', async () => {
  const user = setup();
  // Not valid, so it is not saved.
  await user.type(card('Reck').getByLabelText('Note Anna Frei'), '95');
  await user.click(round('Durchgang 2'));
  expect(round('Durchgang 1, 1 ungespeicherte Eingabe')).toBeVisible();
});

describe('confirming', () => {
  it('needs all grades, and nobody on the apparatus', () => {
    setup();
    expect(card('Reck').getByText('0 von 2 Noten')).toBeVisible();
    expect(card('Reck').queryByRole('button', { name: /bestätigen/ })).toBeNull();
    expect(card('Boden').getByRole('button', { name: 'Durchgang 1 bestätigen' })).toBeVisible();
  });

  it('is offered with all grades, but not with an input that is not saved', async () => {
    const user = setup(createApparatus({ reck: 0, boden: 0 }, { grade: GRADE }));
    const confirm = () => card('Reck').queryByRole('button', { name: 'Durchgang 1 bestätigen' });
    expect(confirm()).toBeVisible();
    await user.type(card('Reck').getByLabelText('Note Anna Frei'), '1');
    expect(confirm()).toBeNull();
  });

  it('does not wait for who has withdrawn', () => {
    setup(createApparatus({ reck: 0, boden: 0 }, { withdrawn: true }));
    expect(card('Reck').getByRole('button', { name: 'Durchgang 1 bestätigen' })).toBeVisible();
  });

  it('is only for the current round and for editors', async () => {
    const user = setup();
    await user.click(round('Durchgang 2'));
    expect(screen.queryByRole('button', { name: /bestätigen/ })).toBeNull();
    cleanup();
    setup(undefined, false);
    expect(screen.queryByRole('button', { name: /bestätigen/ })).toBeNull();
  });
});

it('shows the last round when all are confirmed', () => {
  setup(createApparatus({ reck: null, boden: null }));
  expect(names('Boden')).toEqual(['Bea', 'Anna']);
  expect(card('Boden').getByText('Durchgang 2 · Alle Durchgänge bestätigt')).toBeVisible();
});

it('goes back to the current round, also from an input that is not saved', async () => {
  const user = setup(createApparatus({ reck: 1, boden: 1 }));
  await user.click(round('Durchgang 1'));
  await user.type(card('Reck').getByLabelText('Note Anna Frei'), '95');
  await user.click(round('Aktuell'));
  expect(names('Reck')).toEqual([]);
  expect(round('Durchgang 1, 1 ungespeicherte Eingabe')).toBeVisible();
});

it('does not call a round the next one when it has begun', () => {
  setup(
    createApparatus({ reck: 0, boden: 1 }).map((item) => ({
      ...item,
      rounds: item.rounds.map((entry) => ({
        ...entry,
        slots: entry.slots.map((person, index) =>
          index === 0 ? { ...person, grade: GRADE } : person,
        ),
      })),
    })),
  );
  expect(card('Boden').getByText('Durchgang 2')).toBeVisible();
});
