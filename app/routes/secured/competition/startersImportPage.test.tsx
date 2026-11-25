import ExcelJS from 'exceljs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub, data, Outlet } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createI18n } from '~/lib/i18n';
import StartersImport from './startersImport';

const CONFLICTS = ['Anna', 'Bea'].map((firstname) => ({
  starterId: firstname,
  firstname,
  lastname: 'Muster',
  birthYear: 2010,
  club: { id: 'alt', name: 'TV Alt', location: 'Bern' },
}));
const RESULT = {
  created: 1,
  restored: 0,
  existing: 2,
  clubsChanged: 1,
  clubsKept: 1,
  failures: [],
};

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
  Element.prototype.hasPointerCapture = () => false;
});
afterEach(() => vi.unstubAllGlobals());

/** Opens the review step. The action answers with the results one after the other. */
async function renderReview(...results: unknown[]) {
  const requests: any[] = [];
  const Stub = createRoutesStub([
    {
      id: 'routes/secured/competition/layout',
      path: '/',
      loader: () => ({ competition: { id: 'c' }, contests: [{ id: 'contest', name: 'EGT' }] }),
      Component: () => (
        <I18nextProvider i18n={createI18n('de')}>
          <Outlet />
        </I18nextProvider>
      ),
      children: [
        {
          index: true,
          // Loading takes time again after every action.
          loader: () =>
            new Promise((resolve) =>
              setTimeout(resolve, 100, {
                contest: {
                  id: 'contest',
                  name: 'EGT',
                  categories: { FEMALE: ['K5'], MALE: ['K5'] },
                  apparatus: [],
                  divisions: [],
                },
                clubs: [{ id: 'chur', name: 'TV Chur', location: 'Chur' }],
              }),
            ),
          action: async ({ request }) => {
            requests.push(await request.json());
            return results.shift();
          },
          Component: StartersImport as never,
        },
      ],
    },
  ]);
  render(<Stub />);

  const user = userEvent.setup();
  await user.click(await screen.findByLabelText('Verein'));
  await user.click(screen.getByRole('option', { name: /TV Chur/ }));
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Liste').addRows([
    ['Vorname', 'Nachname', 'Jahrgang', 'Geschlecht'],
    ['Anna', 'Muster', 2010, 'w'],
    ['Bea', 'Muster', 2010, 'w'],
  ]);
  workbook.addWorksheet('Notizen').addRow(['Hallo']);
  const bytes = (await workbook.xlsx.writeBuffer()) as BlobPart;
  await user.upload(screen.getByLabelText('Tabellen'), new File([bytes], 'liste.xlsx'));
  expect(await screen.findByText('Übersprungene Tabellenblätter: Notizen')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Prüfen' }));
  const submit = screen.getByRole('button', { name: '2 Personen importieren' });
  await user.click(submit);
  return { user, requests, submit };
}

it('imports right away when nobody is affected', async () => {
  const { requests } = await renderReview(RESULT);
  const title = await screen.findByRole('heading', { name: 'Import abgeschlossen' });
  await waitFor(() => expect(title).toHaveFocus());
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toHaveProperty('changeClubOf');
  expect(screen.getByText('Verein geändert').nextSibling).toHaveTextContent('1');
  expect(screen.getByText('Verein behalten').nextSibling).toHaveTextContent('1');
});

it('asks whose club changes, nobody by default', async () => {
  const { user, requests } = await renderReview({ conflicts: CONFLICTS }, RESULT);
  const dialog = within(await screen.findByRole('alertdialog'));
  expect(dialog.getAllByRole('checkbox')).toHaveLength(2);
  expect(dialog.queryByRole('checkbox', { checked: true })).not.toBeInTheDocument();
  expect(
    dialog.getByRole('checkbox', { name: /Anna Muster, 2010.*TV Alt.*TV Chur/ }),
  ).toBeVisible();

  await user.click(dialog.getByRole('button', { name: 'Importieren' }));
  await screen.findByRole('heading', { name: 'Import abgeschlossen' });
  expect(requests[1].changeClubOf).toEqual([]);
});

it('sends the chosen starters, and selects all or none', async () => {
  const { user, requests } = await renderReview({ conflicts: CONFLICTS }, RESULT);
  const dialog = within(await screen.findByRole('alertdialog'));
  await user.click(dialog.getByRole('button', { name: 'Alle auswählen' }));
  expect(dialog.getByText('2 Personen wechseln den Verein')).toBeInTheDocument();
  await user.click(dialog.getByRole('button', { name: 'Keine auswählen' }));
  dialog.getByRole('checkbox', { name: /Bea/ }).focus();
  await user.keyboard(' ');
  await user.click(dialog.getByRole('button', { name: 'Importieren' }));
  const title = await screen.findByRole('heading', { name: 'Import abgeschlossen' });
  await waitFor(() => expect(title).toHaveFocus());
  expect(requests[1].changeClubOf).toEqual(['Bea']);
});

it('goes back to the rows and checks again', async () => {
  const { user, requests, submit } = await renderReview(
    { conflicts: CONFLICTS },
    { conflicts: CONFLICTS },
  );
  await screen.findByRole('alertdialog');
  const back = screen.getByRole('button', { name: 'Zurück' });
  // Enter must not import before the question was read.
  await waitFor(() => expect(back).toHaveFocus());
  await user.click(back);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await waitFor(() => expect(submit).toHaveFocus());
  await user.click(submit);
  expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  expect(requests[1]).not.toHaveProperty('changeClubOf');
});

it('imports corrected rows that lead to another question', async () => {
  let answerLast = (_result: unknown) => {};
  const last = new Promise((resolve) => (answerLast = resolve));
  const failures = [{ index: 1, message: 'Ungültige Eingabe.' }];
  const { user, requests } = await renderReview(
    { conflicts: CONFLICTS },
    { ...RESULT, failures },
    { conflicts: [CONFLICTS[1]] },
    last,
  );
  await screen.findByRole('alertdialog');
  await user.click(screen.getByRole('button', { name: 'Importieren' }));
  await user.click(await screen.findByRole('button', { name: 'Fehlgeschlagene korrigieren' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Vorname, Zeile 2')).toHaveValue('Bea');

  await user.click(screen.getByRole('button', { name: '1 Person importieren' }));
  const dialog = within(await screen.findByRole('alertdialog'));
  expect(dialog.getAllByRole('checkbox')).toHaveLength(1);
  await user.click(dialog.getByRole('button', { name: 'Importieren' }));
  // The result of the first import is over.
  await waitFor(() => expect(requests).toHaveLength(4));
  expect(dialog.getByRole('button', { name: 'Importieren' })).toBeDisabled();
  answerLast({ ...RESULT, existing: 77 });
  await screen.findByRole('heading', { name: 'Import abgeschlossen' });
  expect(screen.getByText('77')).toBeInTheDocument();
});

it('keeps the rows when the check fails, and the choice when the import fails', async () => {
  const failure = data({ failed: 'network' }, 500);
  const { user, requests, submit } = await renderReview(
    failure,
    { conflicts: CONFLICTS },
    failure,
    RESULT,
  );
  expect(await screen.findByText(/Keine Verbindung/)).toBeInTheDocument();
  expect(screen.getByLabelText('Vorname, Zeile 1')).toHaveValue('Anna');

  await user.click(submit);
  const dialog = within(await screen.findByRole('alertdialog'));
  await user.click(dialog.getByRole('checkbox', { name: /Anna/ }));
  await user.click(dialog.getByRole('button', { name: 'Importieren' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(/Keine Verbindung/);
  expect(dialog.getByRole('checkbox', { name: /Anna/ })).toBeChecked();

  await user.click(dialog.getByRole('button', { name: 'Importieren' }));
  await screen.findByRole('heading', { name: 'Import abgeschlossen' });
  expect(requests[3].changeClubOf).toEqual(['Anna']);
});
