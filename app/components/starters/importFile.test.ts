import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { MAX_FILE_MB, readStarterFile } from './importFile';

const HEADER = [
  'STV-ID',
  'Vorname',
  'Nachname',
  'Jahrgang',
  'Geschlecht',
  'Kategorie',
  'Abteilung',
];

async function file(sheets: Record<string, unknown[][]>) {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) workbook.addWorksheet(name).addRows(rows);
  return new File([(await workbook.xlsx.writeBuffer()) as BlobPart], 'liste.xlsx');
}

function sheetJsFile(rows: unknown[][], bookType: 'xls' | 'ods') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows, { UTC: true }), 'A');
  return new File([XLSX.write(workbook, { bookType, type: 'array' })], `liste.${bookType}`);
}

describe('readStarterFile', () => {
  it('reads all starter sheets and skips the others', async () => {
    const result = await readStarterFile(
      await file({
        Mädchen: [HEADER, [123, 'ANNA', 'muster-frei', 10, 'w', 'K5', 2]],
        Notizen: [['Bitte bis Freitag melden']],
        Knaben: [
          [],
          HEADER,
          ['', 'Jan', 'Keller', 2009, 'm', 'herren', ''],
          [],
          [null, 'Tim', 'Frei', new Date(Date.UTC(2008, 4, 1)), 'unklar', null, null],
        ],
      }),
    );
    expect(result).toEqual({
      starters: [
        {
          stvId: '123',
          firstname: 'Anna',
          lastname: 'Muster-Frei',
          birthYear: 2010,
          sex: 'FEMALE',
          category: 'K5',
          divisionNumber: 2,
        },
        expect.objectContaining({ stvId: null, firstname: 'Jan', sex: 'MALE', category: 'KH' }),
        expect.objectContaining({ firstname: 'Tim', birthYear: 2008, sex: undefined }),
      ],
      skippedSheets: ['Notizen'],
    });
  });

  it('reads a starter sheet without a sex column among other sheets', async () => {
    const result = await readStarterFile(
      await file({
        Vereinsdaten: [
          ['Verein', 'BTV'],
          ['Vorname', 'Kerstin'],
        ],
        'Anmeldung Ti': [
          ['STV-Nummer', 'VORNAME', 'NACHNAME', 'Jahrgang', 'Kategorie', 'Vereinsname'],
          [3824142, 'Maila', 'Grossmann', 2018, 1, 'BTV'],
        ],
        Tabelle1: [[1, null, 2022]],
      }),
    );
    expect(result).toEqual({
      starters: [expect.objectContaining({ firstname: 'Maila', sex: undefined, category: 'K1' })],
      skippedSheets: ['Vereinsdaten', 'Tabelle1'],
    });
  });

  it('reads the result of formulas', async () => {
    const result = await readStarterFile(
      await file({
        A: [HEADER, [null, { formula: 'UPPER("lea")', result: 'LEA' }, 'Frei', 2010, 'w']],
      }),
    );
    expect(result).toMatchObject({ starters: [{ firstname: 'Lea' }] });
  });

  it('tells when a file has no starter sheet', async () => {
    expect(await readStarterFile(await file({ A: [['Vorname', 'Ort']] }))).toEqual({
      error: 'NO_STARTERS',
    });
  });

  it.each(['xls', 'ods'] as const)('reads %s files', async (bookType) => {
    const birthday = new Date(Date.UTC(2010, 0, 1));
    const result = await readStarterFile(
      sheetJsFile([HEADER, [null, 'Lea', 'Frei', birthday, 'w', 'K5', 1]], bookType),
    );
    expect(result).toMatchObject({ starters: [{ firstname: 'Lea', birthYear: 2010 }] });
  });

  it('reads CSV files in UTF-8 and Windows-1252, with any separator', async () => {
    const text = 'Vorname;Nachname;Jahrgang;Geschlecht\r\nJörg;Müller;01.01.2010;m\r\n';
    const latin1 = Uint8Array.from(text, (char) => char.charCodeAt(0));
    const files = [
      new File([text], 'a.csv'),
      new File([`\ufeff${text.replaceAll(';', ',')}`], 'b.csv'),
      new File([latin1], 'c.csv'),
    ];
    for (const csv of files) {
      expect(await readStarterFile(csv)).toEqual({
        starters: [
          expect.objectContaining({ firstname: 'Jörg', lastname: 'Müller', birthYear: 2010 }),
        ],
        skippedSheets: [],
      });
    }
  });

  it('rejects broken files', async () => {
    expect(await readStarterFile(new File(['PK\u0003\u0004broken'], 'a.xlsx'))).toEqual({
      error: 'UNREADABLE',
    });
    for (const content of ['', 'Vorname;Nachname']) {
      expect(await readStarterFile(new File([content], 'a.csv'))).toEqual({ error: 'NO_STARTERS' });
    }
  });

  it('tells when the reader could not be loaded', async () => {
    vi.doMock('xlsx', () => Promise.reject(new TypeError('Failed to fetch')));
    const valid = await file({ A: [HEADER] });
    expect(await readStarterFile(valid)).toEqual({ error: 'NOT_LOADED' });
    vi.doUnmock('xlsx');
    expect(await readStarterFile(valid)).toEqual({ starters: [], skippedSheets: [] });
  });

  it('rejects large files without reading them', async () => {
    const large = new File([new Uint8Array(MAX_FILE_MB * 1024 * 1024 + 1)], 'a.xlsx');
    expect(await readStarterFile(large)).toEqual({ error: 'TOO_LARGE' });
  });

  it('accepts the template offered for download', async () => {
    const bytes = await readFile('public/templates/UTEG-Import-Vorlage.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    expect((workbook.worksheets[0].getRow(1).values as string[]).slice(1)).toEqual(HEADER);
    expect(await readStarterFile(new File([bytes], 'v.xlsx'))).toEqual({
      starters: [],
      skippedSheets: [],
    });
  });
});
