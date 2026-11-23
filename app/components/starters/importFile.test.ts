import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
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

  it('rejects other and broken files', async () => {
    for (const content of ['', 'Vorname;Nachname', 'PK\u0003\u0004broken']) {
      expect(await readStarterFile(new File([content], 'a.xlsx'))).toEqual({ error: 'UNREADABLE' });
    }
  });

  it('tells when the reader could not be loaded', async () => {
    vi.doMock('exceljs', () => Promise.reject(new TypeError('Failed to fetch')));
    const valid = await file({ A: [HEADER] });
    expect(await readStarterFile(valid)).toEqual({ error: 'NOT_LOADED' });
    vi.doUnmock('exceljs');
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
