import { expect, test, type Browser, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { ACCOUNT } from './account';

const APPARATUS = {
  reck: 'Reck',
  boden: 'Boden',
  schaukelringe: 'Schaukelringe',
  sprung: 'Sprung',
  barren: 'Barren',
};
type Apparatus = keyof typeof APPARATUS;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LASTNAME = 'Frei';

type Division = {
  category: string;
  sex: 'Weiblich' | 'Männlich';
  ground: number;
  order: Apparatus[];
  /** First names by the apparatus they start on. */
  lineups: Partial<Record<Apparatus, string[]>>;
};

const WOMEN: Division = {
  category: 'K5',
  sex: 'Weiblich',
  ground: 1,
  order: ['reck', 'boden', 'schaukelringe', 'sprung'],
  lineups: { reck: ['Anna', 'Bea', 'Carla'], boden: ['Dora', 'Elin'], sprung: ['Flavia'] },
};
const MEN: Division = {
  category: 'K6',
  sex: 'Männlich',
  ground: 2,
  order: ['reck', 'boden', 'schaukelringe', 'sprung', 'barren'],
  lineups: { reck: ['Adrian', 'Beat'], boden: ['Cyril'], barren: ['Dario'] },
};
const DIVISIONS = [WOMEN, MEN];

/** Who starts on the apparatus in the round, in order: the first one is last on the next one. */
function roundList({ order, lineups }: Division, apparatus: Apparatus, round: number) {
  const start = order[(order.indexOf(apparatus) - round + order.length) % order.length];
  const names = lineups[start] ?? [];
  const offset = names.length ? round % names.length : 0;
  return [...names.slice(offset), ...names.slice(0, offset)];
}

test('a competition from the first login to the ranking', async ({ page, browser }) => {
  await test.step('sign in and create the competition', async () => {
    await page.goto('/home');
    await page.getByLabel('E-Mail').fill(ACCOUNT.email);
    await page.getByLabel('Passwort').fill(ACCOUNT.password);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.waitForURL('**/home');

    await page.goto('/competitions/new');
    await page.getByLabel('Name', { exact: true }).fill('Gerätecup');
    await page.getByLabel('Ort', { exact: true }).fill('Bern');
    await page.locator('[name=startDate]').fill('2026-05-09');
    await page.locator('[name=endDate]').fill('2026-05-10');
    const next = page.getByRole('button', { name: 'Weiter' });
    await next.click();
    await page.locator('[name=grounds]').fill('2');
    for (const heading of ['Auszeichnungen', 'Mitglieder', 'Überprüfen']) {
      await next.click();
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    }
    const create = page.getByRole('button', { name: 'Wettkampf erstellen' });
    await expect(async () => {
      await create.click();
      await expect(page).toHaveURL(/competitions\/\w{26}$/, { timeout: 1_000 });
    }).toPass();
  });
  const competitionUrl = page.url();

  const contestUrl = await test.step('create the divisions', async () => {
    await page.getByRole('link', { name: 'Abteilungen' }).click();
    await page.waitForURL('**/divisions');
    for (const { category, sex, ground } of DIVISIONS) {
      await page.getByRole('button', { name: 'Neue Abteilung' }).first().click();
      const dialog = page.getByRole('dialog');
      for (const [label, value] of [
        ['Geschlecht', sex],
        ['Kategorie', category],
        ['Wettkampfplatz', `Wettkampfplatz ${ground}`],
      ]) {
        await dialog.getByLabel(label).click();
        await page.getByRole('option', { name: value, exact: true }).click();
      }
      await dialog.getByRole('button', { name: 'Erstellen' }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(DIVISIONS.length);
    return page.url().replace(/\/divisions$/, '');
  });

  await test.step('import the starters', async () => {
    await page.goto(`${competitionUrl}/starters/import`);
    await page.getByRole('combobox').click();
    await page.getByRole('button', { name: 'Neuen Verein erfassen' }).click();
    await page.getByLabel('Name des Vereins').fill('TV Bern');
    await page.getByLabel('Ort').fill('Bern');
    await page.getByRole('button', { name: 'Verein erfassen', exact: true }).click();
    await expect(page.getByRole('combobox')).toContainText('TV Bern');
    await page.getByLabel('Excel-Dateien').setInputFiles({
      name: 'Teilnehmende.xlsx',
      mimeType: XLSX,
      buffer: await createImportFile(),
    });
    await page.getByRole('button', { name: 'Prüfen' }).click();
    const count = DIVISIONS.flatMap(({ lineups }) => Object.values(lineups).flat()).length;
    await page.getByRole('button', { name: `${count} Personen importieren` }).click();
    await expect(page.getByRole('heading', { name: 'Import abgeschlossen' })).toBeVisible();
    await expect(page.getByText('Neu', { exact: true }).locator('..')).toContainText(`${count}`);
  });

  await test.step('assign the lineups', async () => {
    for (const division of DIVISIONS) {
      await page.goto(`${contestUrl}/divisions`);
      const row = page.getByRole('listitem').filter({ hasText: division.category });
      await row.getByRole('link', { name: 'Riegen' }).click();
      await page.waitForURL('**/lineups');
      for (const [apparatus, names] of Object.entries(division.lineups)) {
        const title = APPARATUS[apparatus as Apparatus];
        for (const name of names) {
          await page.getByRole('checkbox', { name: `${LASTNAME} ${name} auswählen` }).check();
          const selection = page.getByRole('group', { name: 'Auswahl verschieben' });
          await selection.getByRole('button', { name: title }).click();
          await expect(page.getByRole('region', { name: title })).toContainText(name);
        }
      }
      await expect(page.getByText('Alle sind eingeteilt.')).toBeVisible();
    }
  });

  const tablets = new Map<Division, Map<Apparatus, Page>>();
  const display = await test.step('open the tablets and a display', async () => {
    await page.goto(`${competitionUrl}/judges`);
    for (const division of DIVISIONS) {
      const ground = `Wettkampfplatz ${division.ground}`;
      await page.getByRole('tab', { name: ground }).click();
      const pages = new Map<Apparatus, Page>();
      for (const apparatus of division.order) {
        const name = `${APPARATUS[apparatus]}, ${ground}`;
        const link = page.getByRole('link', { name: `${name} öffnen` });
        pages.set(apparatus, await openDevice(browser, await link.getAttribute('href')));
      }
      for (const tablet of pages.values()) {
        await expect(tablet.getByText('Noch keine Abteilung')).toBeVisible();
      }
      tablets.set(division, pages);
    }
    await page.goto(`${competitionUrl}/displays`);
    await page.getByRole('button', { name: 'Neue Notenanzeige' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Erstellen' }).click();
    const link = page.getByRole('link', { name: /Wettkampfplatz 1 öffnen/ });
    const screen = await openDevice(browser, await link.getAttribute('href'), 1920, 1080);
    await expect(screen.getByText('Gleich geht es los')).toBeVisible();
    return screen;
  });

  await test.step('start the divisions', async () => {
    await page.goto(`${contestUrl}/divisions`);
    await page.getByRole('checkbox', { name: 'Alle auswählen' }).check();
    await page.getByRole('button', { name: 'Starten', exact: true }).first().click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Starten' }).click();
    // Nobody touches the tablets and the display.
    await expect(display.getByRole('region', { name: 'Reck' })).toContainText('Anna Frei');
  });

  await test.step('keep a grade while the connection is lost', async () => {
    const tablet = tablets.get(WOMEN)!.get('reck')!;
    await tablet.context().setOffline(true);
    await tablet.getByLabel('Note', { exact: true }).fill('9,15');
    await tablet.getByRole('button', { name: 'Weiter' }).click();
    await expect(tablet.getByText('Keine Antwort vom Server')).toBeVisible();
    await tablet.getByRole('button', { name: 'Trotzdem weiter' }).click();
    await expect(starterOn(tablet)).toHaveText('Bea Frei');
    await tablet.context().setOffline(false);
    await expect(tablet.getByText('Note ist noch nicht gespeichert')).toBeHidden();
    await expect(display.getByRole('region', { name: 'Reck' })).toContainText('9.15');
    // From the first starter, like the other apparatus.
    await tablet.getByRole('button', { name: 'Zurück' }).click();
  });

  await test.step('judge all rounds', async () => {
    await Promise.all(
      [...tablets].flatMap(([division, pages]) =>
        [...pages].map(([apparatus, tablet]) => judge(tablet, division, apparatus)),
      ),
    );
    await expect(display.getByRole('region', { name: 'Reck' })).toBeVisible();
    await page.goto(`${contestUrl}/divisions`);
    await expect(page.getByText('Beendet', { exact: true })).toHaveCount(DIVISIONS.length);
  });

  await test.step('correct a grade after the end', async () => {
    const row = page.getByRole('listitem').filter({ hasText: WOMEN.category });
    await row.getByRole('button', { name: 'Weitere Aktionen' }).click();
    await page.getByRole('menuitem', { name: 'Noteneingabe' }).click();
    await page.waitForURL('**/grading');
    const reck = page.getByRole('region', { name: 'Reck' });
    await reck.getByRole('tab', { name: 'Durchgang 1' }).click();
    const grade = reck.getByRole('listitem').filter({ hasText: 'Anna' });
    await grade.getByRole('textbox').fill('9.95');
    // Nobody has to press a button.
    await page.getByRole('heading', { level: 1 }).click();
    await expect(grade.getByText('Gespeichert: 9.95')).toBeVisible();
  });

  await test.step('show and print the ranking', async () => {
    for (const { category, sex, lineups } of DIVISIONS) {
      const query = new URLSearchParams({ category, sex: sex === 'Weiblich' ? 'FEMALE' : 'MALE' });
      await page.goto(`${contestUrl}/ranking?${query}`);
      for (const name of Object.values(lineups).flat()) {
        await expect(page.getByRole('row', { name: `${name} ${LASTNAME}` })).toBeVisible();
      }
      if (category === WOMEN.category) {
        await expect(page.getByRole('row', { name: /^1 Anna Frei.*9\.95.*Gold/ })).toBeVisible();
      }
    }
    await page.getByRole('button', { name: 'PDF' }).click();
    const printed = page
      .context()
      .waitForEvent('request', (item) => /pdf\/ranking/.test(item.url()));
    await page.getByRole('button', { name: 'PDF erstellen' }).click();
    const response = await page.request.get((await printed).url());
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createImportFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Teilnehmende');
  sheet.addRow(['Vorname', 'Nachname', 'Jahrgang', 'Geschlecht', 'Kategorie', 'Abteilung']);
  for (const { category, sex, lineups } of DIVISIONS) {
    for (const name of Object.values(lineups).flat()) {
      sheet.addRow([name, LASTNAME, 2010, sex, category, 1]);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Opens a link with a key on a device of its own. */
async function openDevice(browser: Browser, href: string | null, width = 820, height = 1180) {
  expect(href).toMatch(/#[\w-]{43}$/);
  const context = await browser.newContext({ viewport: { width, height }, locale: 'de-CH' });
  const device = await context.newPage();
  await device.goto(href!);
  await expect(device.getByText('Verbunden')).toBeVisible();
  expect(device.url()).not.toContain('#');
  return device;
}

function starterOn(tablet: Page) {
  return tablet.locator('form').getByRole('heading', { level: 2 });
}

/** Judges every round of an apparatus and checks who is shown when. */
async function judge(tablet: Page, division: Division, apparatus: Apparatus) {
  const { order } = division;
  for (let round = 0; round < order.length; round++) {
    const roundTitle = `Durchgang ${round + 1} von ${order.length}`;
    await expect(tablet.getByText(roundTitle).first()).toBeVisible();
    const names = roundList(division, apparatus, round);
    for (const [index, name] of names.entries()) {
      await expect(starterOn(tablet)).toHaveText(`${name} ${LASTNAME}`);
      await grade(tablet, apparatus, (8 + round / 10 + index / 100).toFixed(2));
    }
    const title = names.length > 0 ? 'Kontrolle' : 'Pause';
    await expect(tablet.getByRole('heading', { name: title })).toBeVisible();
    await tablet.getByRole('button', { name: 'Durchgang bestätigen' }).click();
  }
  await expect(tablet.getByText('Fertig')).toBeVisible();
}

async function grade(tablet: Page, apparatus: Apparatus, value: string) {
  if (apparatus !== 'sprung') {
    await tablet.getByLabel('Note', { exact: true }).fill(value);
    await tablet.getByLabel('Note', { exact: true }).press('Enter');
    return;
  }
  await tablet.getByLabel('1. Versuch').fill('8,00');
  await tablet.getByLabel('1. Versuch').press('Enter');
  await tablet.getByLabel('2. Versuch').fill(value);
  await expect(tablet.getByLabel(/^Endnote \(/)).not.toHaveValue('');
  await tablet.getByLabel('2. Versuch').press('Enter');
}
