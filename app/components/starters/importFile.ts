import { parseSheet, type ImportedStarter, type SheetCell } from '~/lib/domain/starterImport';
import type { Sex } from '~/modules/types';

// Files are read in the browser, so a harmful one cannot slow down a competition's server.
export const MAX_FILE_MB = 5;
export const MAX_IMPORT_ROWS = 1000;

export const IMPORT_ACCEPT = [
  '.xlsx',
  '.xls',
  '.ods',
  '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
].join(',');

export type FileError = 'UNREADABLE' | 'NO_STARTERS' | 'TOO_LARGE' | 'NOT_LOADED';

/** The starters of all sheets of an XLSX, XLS, ODS or CSV file. */
export async function readStarterFile(
  file: File,
  onlySex?: Sex,
): Promise<{ starters: ImportedStarter[]; skippedSheets: string[] } | { error: FileError }> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) return { error: 'TOO_LARGE' };

  const starters: ImportedStarter[] = [];
  const skippedSheets: string[] = [];
  let hasStarterSheet = false;
  // Large, so it is only loaded when needed.
  const XLSX = await import('xlsx').catch(() => null);
  if (!XLSX) return { error: 'NOT_LOADED' };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const workbook = isBinary(bytes)
      ? XLSX.read(bytes, { type: 'array', cellDates: true })
      : XLSX.read(decode(bytes), { type: 'string', cellDates: true });
    for (const name of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<SheetCell[]>(workbook.Sheets[name], {
        header: 1,
        defval: null,
        // Birth dates are read with getUTCFullYear.
        UTC: true,
      });
      const found = parseSheet(rows, onlySex);
      if (found) starters.push(...found);
      // Nobody misses an empty sheet.
      else if (rows.length > 0) skippedSheets.push(name);
      hasStarterSheet ||= found !== null;
    }
  } catch {
    return { error: 'UNREADABLE' };
  }
  return hasStarterSheet ? { starters, skippedSheets } : { error: 'NO_STARTERS' };
}

// ZIP (xlsx, ods) and OLE (xls) files start with these bytes.
const SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0xd0, 0xcf, 0x11, 0xe0],
];

function isBinary(bytes: Uint8Array) {
  return SIGNATURES.some((signature) => signature.every((byte, index) => bytes[index] === byte));
}

/** SheetJS takes text without a BOM as Latin-1, but most tools write UTF-8. */
function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // What Excel writes in Switzerland.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
