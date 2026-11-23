import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  fillPlaceholders,
  rankingTemplateSchema,
  type RankingTemplateOptions,
} from '~/lib/domain/rankingTemplate';
import { findOverlaps, readPdf } from '~/tests/pdf';
import { renderPdf } from './render.server';
import type { RankingDocumentProps, RankingGroup } from './RankingDocument';
import { contentDisposition } from './response.server';
import { createSampleGroups } from './sample';

const PNG = createPng();
const COMPETITION = { name: 'Gerätecup', location: 'Zürich', date: '9. Mai 2026' };

async function render(
  options: object = {},
  {
    groups = createSampleGroups(),
    ...props
  }: { groups?: RankingGroup[] } & Partial<Pick<RankingDocumentProps, 'logo' | 'competition'>> = {},
) {
  const pdf = await renderPdf({
    type: 'ranking',
    language: 'de',
    props: {
      sections: [{ groups, options: rankingTemplateSchema.parse(options), cover: [] }],
      competition: COMPETITION,
      logo: null,
      ...props,
    },
  });
  return readPdf(pdf);
}

const [k5, k6] = createSampleGroups();
const bold = (items: { text: string; bold: boolean }[]) =>
  items.filter((item) => item.bold).map(({ text }) => text);

describe('ranking PDF', () => {
  it('shows a page per category with title, names, clubs, grades and totals', async () => {
    const pages = await render();
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain('Gerätecup K5 Turnerinnen 9. Mai 2026');
    expect(pages[1].text).toContain('K6 Turnerinnen');
    expect(pages[0].text).toContain('Anna Müller');
    expect(pages[0].text).toContain('Geräteriege Buchs');
    expect(pages[0].text).toContain('9.80');
    expect(pages[0].text).toMatch(/Rang.*RE.*BO.*SR.*SP.*Total/);
  });

  it('renders names with accents that need the extended font', async () => {
    const [entry, ...others] = k5.entries;
    const group = {
      ...k5,
      entries: [{ ...entry, firstname: 'Đorđe', lastname: 'Žižković-Łŏş' }, ...others],
    };
    const [page] = await render({}, { groups: [group] });
    expect(page.text).toContain('Đorđe Žižković-Łŏş');
  });

  it('fills placeholders and leaves unknown ones', async () => {
    const [page] = await render({
      title: '{competition} {location} {unknown}',
      subtitle: '{category} / {sex} / {date}',
      footer: 'Fuss {category}',
    });
    expect(page.text).toContain('Gerätecup Zürich {unknown}');
    expect(page.text).toContain('K5 / Turnerinnen / 9. Mai 2026');
    expect(page.text).toContain('Fuss K5');
  });

  it('hides an empty subtitle', async () => {
    const [page] = await render({ subtitle: '' });
    expect(page.text).not.toContain('Turnerinnen');
  });

  it.each([
    ['club', 'TV Altstetten'],
    ['location', 'Frauenfeld '],
    ['birthYear', '2013'],
    ['apparatus', 'RE'],
    ['total', 'Total'],
    ['firstname', 'Anna'],
    ['lastname', 'Müller'],
  ])('shows the column %s only when selected', async (column, text) => {
    const contains = async (shown: boolean) => {
      const [page] = await render({
        columns: { [column]: shown, ...(column === 'location' && { club: false }) },
      });
      return `${page.text} `.includes(text);
    };
    expect(await contains(true)).toBe(true);
    expect(await contains(false)).toBe(false);
  });

  it('shows the award column only when selected', async () => {
    const [shown] = await render();
    const [hidden] = await render({ columns: { award: false } });
    expect(bold(shown.items)).toEqual(expect.arrayContaining(['G', 'S', 'B']));
    expect(shown.text).toContain('*');
    expect(bold(hidden.items)).not.toContain('G');
    expect(hidden.text).not.toContain('*');
  });

  it('formats names', async () => {
    expect((await render({ nameFormat: 'lastFirst' }))[0].text).toContain('Müller Anna');
    const [separate] = await render({ nameFormat: 'separate' });
    expect(separate.items.map(({ text }) => text)).toEqual(
      expect.arrayContaining(['Vorname', 'Nachname', 'Anna', 'Müller']),
    );
  });

  it('uses 2 or 3 decimals', async () => {
    expect((await render({ decimals: 2 }))[0].text).not.toContain('9.800');
    expect((await render({ decimals: 3 }))[0].text).toContain('9.800');
  });

  it('marks medals with letters, icons or not at all', async () => {
    const [letters] = await render({ medalStyle: 'letters' });
    const [icons] = await render({ medalStyle: 'icons' });
    const [none] = await render({ medalStyle: 'none' });
    expect(bold(letters.items)).toContain('G');
    expect(bold(icons.items)).not.toContain('G');
    expect(icons.colors).toEqual(expect.arrayContaining(['#d4a017', '#9ca3af', '#b06a2c']));
    expect(bold(none.items)).not.toContain('G');
    expect(none.colors).not.toContain('#d4a017');
    expect(none.text).toContain('*');
  });

  it('highlights the best grades only when wanted', async () => {
    const best = '9.80';
    expect(bold((await render({ highlightBest: true }))[0].items)).toContain(best);
    expect(bold((await render({ highlightBest: false }))[0].items)).not.toContain(best);
  });

  it('shows page numbers, the date and the footer only when wanted', async () => {
    const [shown] = await render({ footer: 'Mit Dank an alle' });
    expect(shown.text).toContain('1 / 2');
    expect(shown.text).toContain('Mit Dank an alle');
    const [hidden] = await render({ showPageNumbers: false, showDate: false });
    expect(hidden.text).not.toContain('1 / 2');
    expect(hidden.text).not.toContain('9. Mai 2026');
    expect(hidden.text).not.toContain('Mit Dank');
  });

  it('prints the signature lines', async () => {
    const [page] = await render({ signatureLabels: ['Wettkampfleitung', 'Rechnungsbüro'] });
    expect(page.text).toContain('Wettkampfleitung');
    expect(page.text).toContain('Rechnungsbüro');
  });

  it('only shows awarded entries when wanted', async () => {
    const names = async (options: object) =>
      (await render(options))[0].items.filter(({ text }) => / /.test(text)).length;
    expect(await names({ onlyAwarded: true })).toBeLessThan(await names({}));
  });

  it('is upright or wide', async () => {
    const [portrait] = await render({ orientation: 'portrait' });
    const [landscape] = await render({ orientation: 'landscape' });
    expect(portrait.width).toBeLessThan(portrait.height);
    expect(landscape.width).toBeGreaterThan(landscape.height);
  });

  it('uses the accent colour with readable text', async () => {
    const [dark] = await render({ accentColor: '#7f1d1d' });
    expect(dark.colors).toContain('#7f1d1d');
    expect(dark.colors).toContain('#ffffff');
    const [light] = await render({ accentColor: '#fde047' });
    expect(light.colors).toContain('#fde047');
    expect(light.colors).not.toContain('#ffffff');
  });

  it('changes font size and row height', async () => {
    const find = async (options: object) =>
      (await render(options))[0].items.filter(({ text }) => text.startsWith('TV Altstetten'));
    const [small] = await find({ fontSize: 6 });
    const [normal] = await find({ fontSize: 9 });
    expect(small.size).toBeCloseTo(6);
    expect(normal.size).toBeCloseTo(9);
    const gap = ([a, b]: { y: number }[]) => Math.abs(a.y - b.y);
    expect(gap(await find({ rowHeight: 40 }))).toBeGreaterThan(
      gap(await find({ rowHeight: 18 })) * 1.5,
    );
  });

  it('places the logo, or leaves it out', async () => {
    const x = async (logoPosition: string) => {
      const [page] = await render({ logoPosition }, { logo: PNG });
      expect(page.images).toBe(1);
      return page.imageX;
    };
    const [left, center, right] = [await x('left'), await x('center'), await x('right')];
    expect(left).toBeLessThan(center!);
    expect(center).toBeLessThan(right!);
    expect((await render({ showLogo: false }, { logo: PNG }))[0].images).toBe(0);
  });

  it('survives a logo that cannot be decoded', async () => {
    const logo = { mimeType: 'image/png', data: PNG.data.slice(0, 20) };
    expect((await render({}, { logo }))[0].text).toContain('Anna Müller');
  });

  it('puts categories on one page under headings', async () => {
    const pages = await render({ newPagePerCategory: false });
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain('K5, K6 Turnerinnen');
    expect(bold(pages[0].items)).toEqual(
      expect.arrayContaining(['K5 Turnerinnen', 'K6 Turnerinnen']),
    );
  });

  it('shows a custom heading above each table', async () => {
    const pages = await render({ groupHeading: 'Final {category}' });
    expect(pages[0].text).toContain('Final K5');
    expect(pages[1].text).toContain('Final K6');
  });

  it('marks provisional, incomplete and empty rankings', async () => {
    const text = async (group: Partial<RankingGroup>) =>
      (await render({}, { groups: [{ ...k5, ...group }] }))[0].text;
    expect(await text({ status: 'provisional' })).toContain('Provisorisch');
    expect(await text({ status: 'incomplete' })).toContain('Unvollständig');
    expect(await text({ missingGrades: 1 })).toContain('1 Note fehlt');
    expect(await text({ missingGrades: 3 })).toContain('3 Noten fehlen');
    const empty = await text({ entries: [] });
    expect(empty).toContain('Keine Resultate');
    expect(empty).not.toMatch(/Provisorisch|Unvollständig|fehl/);
  });

  it('prints the decimals the ranks are based on and highlights what is best then', async () => {
    const group: RankingGroup = {
      ...k5,
      precision: 3,
      best: { ...k5.best, reck: 9124 },
      entries: k5.entries.map((entry, index) => ({
        ...entry,
        values: { ...entry.values, reck: 9124 - Math.min(index, 1) * 3 },
      })),
    };
    const [page] = await render({ decimals: 2 }, { groups: [group] });
    expect(page.items.filter(({ text }) => text === '9.12')).toEqual([]);
    expect(page.items.filter(({ text }) => text === '9.124').map(({ bold }) => bold)).toEqual([
      true,
    ]);
    expect(page.items.find(({ text }) => text === '9.121')).toMatchObject({ bold: false });
  });

  // Both made react-pdf add pages forever.
  it.each(['portrait', 'landscape'] as const)(
    'limits a long title, subtitle, heading and footer on %s pages',
    async (orientation) => {
      const competition = { ...COMPETITION, name: 'Wettkampf '.repeat(19) };
      const long = '{competition} '.repeat(14);
      const options = {
        ...rankingTemplateSchema.parse({
          orientation,
          title: long,
          subtitle: long,
          groupHeading: long,
          signatureLabels: Array.from({ length: 4 }, () => 'W'.repeat(100)),
        }),
        // More than the schema allows, and placeholders make it longer.
        footer: `${'a\n'.repeat(100)}{competition}`,
      } satisfies RankingTemplateOptions;
      const pages = await readPdf(
        await renderPdf({
          type: 'ranking',
          language: 'de',
          props: {
            sections: [{ groups: createSampleGroups(), options, cover: [] }],
            competition,
            logo: PNG,
          },
        }),
      );
      expect(pages.length).toBeLessThan(6);
      for (const { items } of pages) expect(findOverlaps(items)).toEqual([]);
    },
  );

  it('keeps a heading, its table header and the first row together', async () => {
    for (let count = 34; count < 48; count++) {
      const entries = Array.from({ length: count }, (_, index) => ({
        ...k5.entries[0],
        id: String(index),
      }));
      const pages = await render(
        { newPagePerCategory: false },
        {
          groups: [
            { ...k5, entries },
            { ...k6, status: 'incomplete', missingGrades: 2 },
          ],
        },
      );
      const page = pages.find(({ items }) =>
        items.some(({ text, bold }) => bold && text === 'K6 Turnerinnen'),
      )!;
      expect(page.text, `${count} rows`).toMatch(/Unvollständig.*Rang.*Maria-Alexandra/);
    }
  }, 30_000);

  it('never adds a hyphen to a name', async () => {
    const names = ['Anna-Katharina', 'Oberholzer-Niedermann', 'Wolfeschlegelsteinhausenberger'];
    const entries = names.map((lastname, index) => ({ ...k5.entries[index], lastname }));
    const [page] = await render(
      { nameFormat: 'separate', fontSize: 16, columns: { location: true } },
      { groups: [{ ...k5, entries }] },
    );
    const joined = page.items.map(({ text }) => text).join('');
    const hyphens = [...names, ...entries.flatMap((e) => [e.firstname, e.clubName, e.clubLocation])]
      .join('')
      .split('-').length;
    expect(
      joined
        .slice(joined.indexOf('Total'))
        .replace(/\d+ \/ \d+$/, '')
        .split('-'),
    ).toHaveLength(hyphens);
  });

  it('repeats the headers on every page and never splits a row', async () => {
    const entries = Array.from({ length: 12 }, (_, copy) =>
      k5.entries.map((entry) => ({ ...entry, id: `${copy}-${entry.id}` })),
    ).flat();
    const pages = await render(
      { footer: 'Zeile\n\n\n' + 'W M '.repeat(60) },
      { groups: [{ ...k5, entries }] },
    );
    expect(pages.length).toBeGreaterThan(2);
    for (const { text, items } of pages) {
      expect(text).toContain('K5 Turnerinnen');
      expect(text).toContain('Rang');
      expect(findOverlaps(items)).toEqual([]);
    }
    const clubs = pages.flatMap(({ text }) => text.match(/TV Altstetten/g) ?? []);
    expect(clubs).toHaveLength(24);
  });

  it.each([
    { fontSize: 16, columns: { location: true } },
    { fontSize: 16, columns: { location: true }, nameFormat: 'separate', decimals: 3 },
    { fontSize: 16, orientation: 'landscape', columns: { location: true } },
    {},
  ])('never overlaps long texts with %j', async (options) => {
    const [first, ...others] = k5.entries;
    const apparatus = ['reck', 'boden', 'schaukelringe', 'sprung', 'barren'];
    const group: RankingGroup = {
      ...k5,
      sex: 'MALE',
      apparatus,
      best: { ...k5.best, barren: 10000 },
      entries: [
        {
          ...first,
          firstname: 'Maximilian-Alexander',
          lastname: 'Wolfeschlegelsteinhausenbergerdorff',
          clubName: 'Donaudampfschifffahrtsgesellschaftsturnverein',
          clubLocation: 'Schönenwerdniedergösgenoberdorf',
          values: Object.fromEntries(apparatus.map((key) => [key, 10000])),
          total: 50000,
        },
        ...others.map((entry) => ({ ...entry, values: { ...entry.values, barren: null } })),
      ],
    };
    const [page] = await render(options, { groups: [group, k6] });
    expect(findOverlaps(page.items)).toEqual([]);
    for (const { x, width } of page.items) expect(x + width).toBeLessThanOrEqual(page.width - 39);
  });
});

describe('fillPlaceholders', () => {
  it('does not treat inserted values as placeholders', () => {
    const values = { category: '{sex}', sex: 'x', competition: '', location: '', date: '' };
    expect(fillPlaceholders('{category} {toString} {', values)).toBe('{sex} {toString} {');
  });
});

describe('contentDisposition', () => {
  it('keeps umlauts and removes what is unsafe', () => {
    expect(contentDisposition('Gerätecup "A"/\\\r\nX: y.pdf')).toBe(
      `inline; filename="Geraetecup A X y.pdf"; filename*=UTF-8''Ger%C3%A4tecup%20A%20X%20y.pdf`,
    );
    expect(contentDisposition('日本 (1).pdf')).toBe(
      `inline; filename="__ (1).pdf"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%20%281%29.pdf`,
    );
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A red 2x1 pixel image. */
function createPng() {
  const chunk = (type: string, content: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), content]);
    const result = Buffer.alloc(body.length + 8);
    result.writeUInt32BE(content.length, 0);
    body.copy(result, 4);
    result.writeUInt32BE(crc32(body), body.length + 4);
    return result;
  };
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const data = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { mimeType: 'image/png', data: new Uint8Array(data) };
}
