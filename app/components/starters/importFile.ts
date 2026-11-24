import { parseSheet, type ImportedStarter, type SheetCell } from '~/lib/domain/starterImport';
import type { Sex } from '~/modules/types';

// Files are read in the browser, so a harmful one cannot slow down a competition's server.
export const MAX_FILE_MB = 5;
export const MAX_IMPORT_ROWS = 1000;

export type FileError = 'UNREADABLE' | 'NO_STARTERS' | 'TOO_LARGE' | 'NOT_LOADED';

/** The starters of all sheets of an XLSX file. */
export async function readStarterFile(
  file: File,
  onlySex?: Sex,
): Promise<{ starters: ImportedStarter[]; skippedSheets: string[] } | { error: FileError }> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) return { error: 'TOO_LARGE' };

  const starters: ImportedStarter[] = [];
  const skippedSheets: string[] = [];
  let hasStarterSheet = false;
  // Large, so it is only loaded when needed.
  const { default: ExcelJS } = await import('exceljs').catch(() => ({ default: null }));
  if (!ExcelJS) return { error: 'NOT_LOADED' };
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    for (const worksheet of workbook.worksheets) {
      const rows: unknown[][] = [];
      // Cells are numbered from 1.
      worksheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      const found = parseSheet(rows as SheetCell[][], onlySex);
      if (found) starters.push(...found);
      // Nobody misses an empty sheet.
      else if (rows.length > 0) skippedSheets.push(worksheet.name);
      hasStarterSheet ||= found !== null;
    }
  } catch {
    return { error: 'UNREADABLE' };
  }
  return hasStarterSheet ? { starters, skippedSheets } : { error: 'NO_STARTERS' };
}
