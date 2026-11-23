import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import type { TabletSlot } from '~/components/judging/types';
import { createI18n } from '~/lib/i18n';
import { GradingRow } from './GradingRow';
import { GradingSaveStatus } from './GradingSaveStatus';
import { useGradeDrafts } from './useGradeDrafts';

const URL = '/grades';

function createSlot(patch: Partial<TabletSlot> = {}): TabletSlot {
  return {
    entryId: 'anna',
    starterId: 'anna',
    contestId: 'c1',
    divisionId: 'd1',
    divisionNumber: 1,
    category: 'K5',
    sex: 'FEMALE',
    firstname: 'Anna',
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
  id: 'g1',
  version,
  requestId: null,
  value,
  attempts: [],
  updatedAt: new Date(0),
});

const VAULT = { attempts: 2, aggregation: 'MAX' } as const;

const send = vi.fn<typeof fetch>();
const values = () =>
  send.mock.calls
    .filter(([url]) => url === URL)
    .map(([, init]) => JSON.parse(init!.body as string).grade.value);
const saves: typeof fetch = async (url, init) => {
  if (url !== URL) return new Response('ok');
  const { grade: sent, requestId } = JSON.parse(init!.body as string);
  return Response.json({
    ok: true,
    savedAt: 1,
    grade: { id: 'g1', version: 2, requestId, ...sent },
  });
};

let show: (slot: TabletSlot) => void;

function setup(initial: TabletSlot) {
  const capture = (set: typeof show) => (show = (slot) => act(() => set(slot)));
  function Page() {
    const [slot, setSlot] = useState(initial);
    const slots = useMemo(() => [slot], [slot]);
    const drafts = useGradeDrafts({ url: URL, prefix: 'test', slots, loadedAt: 0, status: 'open' });
    capture(setSlot);
    return (
      <>
        <GradingSaveStatus drafts={drafts} />
        <ul>
          <GradingRow slot={slot} position={1} drafts={drafts} canEdit />
        </ul>
        <button>elsewhere</button>
      </>
    );
  }
  const Stub = createRoutesStub([{ path: '/', Component: Page }]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <Stub />
    </I18nextProvider>,
  );
  return userEvent.setup();
}

const input = () => screen.getByLabelText<HTMLInputElement>('Note Anna Frei');
const elsewhere = () => screen.getByRole('button', { name: 'elsewhere' });
const saved = (text: string) => screen.findByText(`Gespeichert: ${text}`);

beforeEach(() => {
  localStorage.clear();
  send.mockReset();
  send.mockImplementation(saves);
  vi.stubGlobal('fetch', send);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('saves when the field is left, without a button', async () => {
  const user = setup(createSlot());
  await user.type(input(), '9,5');
  expect(screen.queryByRole('button', { name: /speichern/ })).toBeNull();
  expect(values()).toEqual([]);
  await user.click(elsewhere());
  await saved('9.50');
  expect(values()).toEqual([9500]);
  expect(screen.getByText('Gespeichert', { exact: true })).toBeInTheDocument();
});

it('saves with Enter and stays in the field', async () => {
  const user = setup(createSlot());
  await user.type(input(), '9.5{Enter}');
  await saved('9.50');
  expect(input()).toHaveFocus();
  await user.clear(input());
  await user.type(input(), '9.6{Enter}');
  await saved('9.60');
  expect(values()).toEqual([9500, 9600]);
});

it('never saves a value that is still being typed', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = setup(createSlot());
  await user.type(input(), '9');
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(values()).toEqual([]);
});

it('does not save when the window loses the focus', async () => {
  const user = setup(createSlot());
  await user.type(input(), '9');
  // The field stays the active element.
  act(() => {
    input().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(document.activeElement).toBe(input());
  expect(values()).toEqual([]);
});

it('keeps what is typed while the save runs and saves it afterwards', async () => {
  let respond = () => {};
  send.mockImplementationOnce(
    (url, init) => new Promise((resolve) => (respond = () => resolve(saves(url, init)))),
  );
  const user = setup(createSlot());
  await user.type(input(), '9{Enter}');
  await user.type(input(), '.5');
  await user.click(elsewhere());
  expect(values()).toEqual([9000]);
  await act(async () => respond());
  await saved('9.50');
  expect(values()).toEqual([9000, 9500]);
});

describe('attempts', () => {
  const attempt = (number: number) => screen.getByLabelText(`${number}. Versuch Anna Frei`);

  it('are saved when the row is left, not between them', async () => {
    const user = setup(createSlot({ inputRule: VAULT }));
    await user.type(attempt(1), '9');
    await user.click(attempt(2));
    await user.type(attempt(2), '8');
    expect(values()).toEqual([]);
    await user.click(elsewhere());
    await saved('9.00');
    expect(values()).toEqual([9000]);
  });

  it('are explained when one is missing', async () => {
    const user = setup(createSlot({ inputRule: VAULT }));
    await user.type(attempt(1), '9');
    await user.click(elsewhere());
    expect(screen.getByText('Bitte eine Note eintragen.')).toBeVisible();
    expect(values()).toEqual([]);
  });
});

it('explains an invalid value and does not send it', async () => {
  const user = setup(createSlot());
  await user.type(input(), '95');
  await user.click(elsewhere());
  expect(screen.getByText('Die Note muss zwischen 0 und 10 liegen.')).toBeVisible();
  expect(values()).toEqual([]);
});

it('never deletes a grade by clearing the field', async () => {
  const user = setup(createSlot({ grade: grade(9000) }));
  await user.clear(input());
  await user.click(elsewhere());
  expect(input()).toHaveValue('9.00');
  expect(values()).toEqual([]);
  expect(screen.getByRole('button', { name: 'Note von Anna Frei löschen' })).toBeEnabled();
});

it('can be undone before the field is left', async () => {
  const user = setup(createSlot({ grade: grade(9000) }));
  await user.clear(input());
  await user.type(input(), '8');
  await user.click(screen.getByRole('button', { name: 'Eingabe für Anna Frei verwerfen' }));
  expect(input()).toHaveValue('9.00');
  await user.click(elsewhere());
  expect(values()).toEqual([]);
});

it('asks about a conflict instead of saving', async () => {
  const user = setup(createSlot({ grade: grade(9000) }));
  await user.clear(input());
  await user.type(input(), '8');
  show(createSlot({ grade: grade(9500, 2) }));
  await user.click(elsewhere());
  expect(values()).toEqual([]);
  expect(screen.getByText('Gespeichert ist 9.50. Deine Eingabe: 8.00.')).toBeVisible();
});

it('offers to save what was typed before a reload', async () => {
  const user = setup(createSlot());
  await user.type(input(), '9.5');
  cleanup();
  send.mockClear();
  const again = setup(createSlot());
  expect(input()).toHaveValue('9.5');
  expect(values()).toEqual([]);
  await again.click(screen.getByRole('button', { name: 'Note von Anna Frei speichern' }));
  await saved('9.50');
});
