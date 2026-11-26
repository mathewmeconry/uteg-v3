import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import type { TabletSlot } from '~/components/judging/types';
import { createI18n } from '~/lib/i18n';
import { GradeGrid } from './GradeGrid';
import { useGradeDrafts } from './useGradeDrafts';

const URL = '/grades';
const ORDER = ['reck', 'boden'];
const PEOPLE = [
  ['Anna', 'reck'],
  ['Bea', 'reck'],
  ['Cleo', 'boden'],
];

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
    decimals: 2,
    grade: null,
    scanned: null,
    apparatus,
    ...patch,
  };
}

const grade = (value: number) => ({ version: 1, value, attempts: [], updatedAt: new Date(0) });

/** Two lineups that change places, with grades of the first round on the Reck. */
function createApparatus(patch: Record<string, Partial<TabletSlot>> = {}) {
  return ORDER.map((apparatus, index) => ({
    apparatus,
    rounds: [0, 1].map((round) => ({
      round,
      slots: PEOPLE.filter(
        ([, start]) => (ORDER.indexOf(start) + round) % ORDER.length === index,
      ).map(([name]) => slot(name, apparatus, patch[`${name} ${apparatus}`])),
    })),
  }));
}

const send = vi.fn<typeof fetch>();
const sent = () =>
  send.mock.calls
    .filter(([url]) => url === URL)
    .map(([, init]) => {
      const { entryId, apparatus, grade: value } = JSON.parse(init!.body as string);
      return [entryId, apparatus, value.value];
    });

function setup({
  patch,
  canEdit = true,
  isRunning = true,
}: {
  patch?: Record<string, Partial<TabletSlot>>;
  canEdit?: boolean;
  isRunning?: boolean;
} = {}) {
  function Page() {
    const drafts = useGradeDrafts({ url: URL, storageKey: 'test', loadedAt: 0 });
    return (
      <>
        <GradeGrid
          apparatus={createApparatus(patch)}
          progress={{ reck: 1, boden: 0 }}
          isRunning={isRunning}
          drafts={drafts}
          canEdit={canEdit}
        />
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

const input = (name: string, apparatus: string) =>
  screen.getByLabelText<HTMLInputElement>(`Note ${name} Frei, ${apparatus}`);
const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name} Frei`) });

beforeEach(() => {
  localStorage.clear();
  send.mockReset();
  send.mockImplementation(async (url, init) => {
    if (url !== URL) return new Response('ok');
    const { grade: value } = JSON.parse(init!.body as string);
    return Response.json({ ok: true, savedAt: 1, grade: { version: 2, ...value } });
  });
  vi.stubGlobal('fetch', send);
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('groups the starters by lineup and says where each lineup is', () => {
  setup();
  const groups = screen.getAllByRole('rowheader').filter((cell) => /^Riege/.test(cell.textContent));
  // The Reck has confirmed its first round, the Boden has not.
  expect(groups.map((cell) => cell.textContent)).toEqual([
    'Riege Reck',
    'Riege BodenJetzt: Reck, Boden',
  ]);
});

it('does not say where anyone is when nothing runs', () => {
  setup({ isRunning: false });
  expect(screen.queryByText(/Jetzt:/)).not.toBeInTheDocument();
});

it('goes down the apparatus within the lineup with Enter and saves', async () => {
  const user = setup();
  await user.click(input('Anna', 'Reck'));
  await user.keyboard('9.4{Enter}');
  expect(input('Bea', 'Reck')).toHaveFocus();
  await user.keyboard('9.5{Enter}');
  expect(input('Bea', 'Reck')).toHaveFocus();
  await vi.waitFor(() =>
    expect(sent()).toEqual([
      ['Anna', 'reck', 9400],
      ['Bea', 'reck', 9500],
    ]),
  );
});

it('saves when a cell is left for another one of the same person, and adds up', async () => {
  const user = setup({ patch: { 'Anna reck': { grade: grade(9000) } } });
  expect(within(row('Anna')).getByText('9.00')).toBeInTheDocument();
  await user.type(input('Anna', 'Boden'), '8,5');
  await user.click(input('Anna', 'Reck'));
  expect(await within(row('Anna')).findByText('17.50')).toBeInTheDocument();
  expect(sent()).toEqual([['Anna', 'boden', 8500]]);
});

it('offers to send again what was refused, below the row', async () => {
  send.mockImplementation(async (url) =>
    url === URL ? Response.json({ ok: false, code: 'ENTRY_WITHDRAWN' }) : new Response('ok'),
  );
  const user = setup();
  await user.type(input('Anna', 'Reck'), '9');
  expect(screen.queryByRole('button', { name: /speichern/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'elsewhere' }));
  const discard = await screen.findByRole('button', {
    name: 'Eingabe für Anna Frei, Reck verwerfen',
  });
  await user.click(discard);
  expect(input('Anna', 'Reck')).toHaveValue('');
});

it('moves nothing in the grid while grades wait for the connection', async () => {
  send.mockImplementation((url) =>
    url === URL ? Promise.reject(new TypeError('offline')) : Promise.resolve(new Response('ok')),
  );
  const user = setup();
  const count = screen.getAllByRole('row').length;
  await user.type(input('Anna', 'Reck'), '9');
  await user.click(input('Bea', 'Reck'));
  expect(
    await screen.findByLabelText('Wird gesendet, sobald die Verbindung zurück ist'),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(count);
  expect(screen.queryByRole('button', { name: /verwerfen/ })).not.toBeInTheDocument();
});

it('lets go of what was typed for someone who was withdrawn or left', async () => {
  const draft = (entryId: string, name: string) => [
    `reck:${entryId}`,
    {
      entryId,
      apparatus: 'reck',
      name,
      inputRule: { attempts: 1, aggregation: 'NONE' },
      fields: { attempts: [], final: '9' },
      base: null,
      queued: false,
      sent: false,
      saving: false,
      rejected: null,
    },
  ];
  const stored = [draft('Anna', 'Anna Frei'), draft('gone', 'Dora Frei')];
  localStorage.setItem('test', JSON.stringify(stored));
  const user = setup({ patch: { 'Anna reck': { withdrawn: true } } });
  for (const name of ['Anna', 'Dora']) {
    await user.click(
      screen.getByRole('button', { name: `Eingabe für ${name} Frei, Reck verwerfen` }),
    );
  }
  expect(screen.queryByText(/Dora Frei/)).not.toBeInTheDocument();
  expect(localStorage.getItem('test')).toBe('[]');
});

it('deletes from the menu of the row, after asking', async () => {
  const user = setup({ patch: { 'Anna reck': { grade: grade(9000) } } });
  await user.click(screen.getByRole('button', { name: 'Weitere Aktionen für Anna Frei' }));
  await user.click(
    await screen.findByRole('menuitem', { name: 'Note am Gerät Reck löschen (9.00)' }),
  );
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    'Die Note 9.00 von Anna Frei am Gerät Reck wird gelöscht.',
  );
});

it('shows viewers and withdrawn starters without fields', () => {
  setup({ canEdit: false, patch: { 'Anna reck': { grade: grade(9000) } } });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Weitere/ })).not.toBeInTheDocument();
  expect(within(row('Anna')).getAllByText('9.00')).toHaveLength(2);
  cleanup();
  setup({ patch: { 'Anna reck': { withdrawn: true }, 'Anna boden': { withdrawn: true } } });
  expect(within(row('Anna')).queryByRole('textbox')).not.toBeInTheDocument();
  expect(within(row('Bea')).getAllByRole('textbox')).toHaveLength(2);
});
