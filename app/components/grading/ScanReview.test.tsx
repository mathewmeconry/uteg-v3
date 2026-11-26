import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '~/lib/i18n';
import type { ScanResult } from '~/lib/scan/scanPhoto.client';
import { ScanReview } from './ScanReview';

vi.mock('~/hooks/useCompetition', () => ({ useCompetition: () => ({ competition: { id: 'c' } }) }));

const SINGLE = { attempts: 1, aggregation: 'NONE' } as const;

function row(entryId: string, firstname: string, grade: { value: number; version: number } | null) {
  return {
    entryId,
    firstname,
    lastname: 'Frei',
    withdrawn: false,
    inputRule: SINGLE,
    precision: 2,
    grade: grade && { ...grade, attempts: [] },
  };
}

const RESULT: Extract<ScanResult, { kind: 'done' }> = {
  kind: 'done',
  code: 'UTEG1',
  sheet: {
    apparatus: 'reck',
    round: 0,
    attempts: 1,
    divisions: [{ contestId: 'c', ground: 1, category: 'K5', sex: 'FEMALE', number: 1 }],
    keepHandwriting: true,
    rows: [
      row('anna', 'Anna', null),
      row('bea', 'Bea', { value: 9000, version: 3 }),
      // Read like saved already.
      row('cleo', 'Cleo', { value: 9050, version: 1 }),
    ],
  },
  readings: [
    { value: 9350, confidence: 0.95 },
    { value: 8700, confidence: 0.4 },
    { value: 9050, confidence: 0.99 },
  ],
  images: [null, null, null],
  scanned: [
    { row: 0, id: 's0' },
    { row: 1, id: 's1' },
  ],
};

const send = vi.fn<typeof fetch>();
const saved = () =>
  send.mock.calls
    .filter(([url]) => url === '/api/competitions/c/grades')
    .map(([, init]) => {
      const { entryId, grade, version } = JSON.parse(init!.body as string);
      return { entryId, value: grade.value, version };
    });

function setup() {
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <ScanReview result={RESULT} />
    </I18nextProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  send.mockReset();
  send.mockImplementation(async (url, init) =>
    url === '/api/competitions/c/grades'
      ? Response.json({ ok: true, savedAt: 1, grade: JSON.parse(init!.body as string).grade })
      : Response.json({ discarded: true }),
  );
  vi.stubGlobal('fetch', send);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('saves the corrected readings with the versions they replace', async () => {
  const user = setup();
  // Cleo's is saved like that already.
  expect(screen.getAllByText('Gespeichert')).toHaveLength(1);
  const bea = screen.getByLabelText('Note Bea Frei');
  await user.clear(bea);
  await user.type(bea, '8,8');
  await user.click(screen.getByRole('button', { name: '2 Noten übernehmen' }));
  expect(await screen.findAllByText('Gespeichert')).toHaveLength(3);
  expect(saved()).toEqual([
    { entryId: 'anna', value: 9350, version: null },
    { entryId: 'bea', value: 8800, version: 3 },
  ]);
});

it('keeps a row whose discarding the server refused', async () => {
  send.mockImplementation(async () => Response.json({ error: 'Nicht erlaubt' }, { status: 400 }));
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Gescannte Note von Bea Frei verwerfen' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Nicht erlaubt');
  expect(screen.getByLabelText('Note Bea Frei')).toBeInTheDocument();
});
