import { parseSheet, parseSheets, type ImportedStarter } from '~/lib/domain/starterImport';

// Files are read in the browser, so a harmful one cannot slow down a competition's server.
export const MAX_FILE_MB = 5;
export const MAX_IMPORT_ROWS = 1000;

export type FileError = 'UNREADABLE' | 'NO_STARTERS' | 'TOO_LARGE';

/** The starters of all sheets of an XLSX file. */
export async function readStarterFile(
  file: File,
): Promise<{ starters: ImportedStarter[] } | { error: FileError }> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) return { error: 'TOO_LARGE' };

  const sheets: Parameters<typeof parseSheets>[0][number][] = [];
  try {
    // Large, so it is only loaded when needed.
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    for (const worksheet of workbook.worksheets) {
      const rows: unknown[][] = [];
      // Cells are numbered from 1.
      worksheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      sheets.push(rows as (typeof sheets)[number]);
    }
  } catch {
    return { error: 'UNREADABLE' };
  }
  if (sheets.every((sheet) => parseSheet(sheet) === null)) return { error: 'NO_STARTERS' };
  return { starters: parseSheets(sheets) };
}
