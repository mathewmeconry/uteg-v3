/**
 * Reads photos of judging sheets off the page's thread, which reading would stop for a moment per
 * photo. Answers `{ id, competitionId, photo }` with `{ id, result }`, or `{ id }` when it failed.
 */
import type { InputRule, Sex } from '~/modules/types';
import stored from './digitModel.json';
import { loadModel } from './digits';
import { readQrCode, readRow, type ReadRow } from './rows';
import { findPage, type Gray } from './sheet';

/** Larger photos take longer to read and are not more exact. */
const MAX_SIDE = 2400;

type ScannedSheet = {
  apparatus: string;
  round: number;
  attempts: number;
  divisions: { contestId: string; ground: number; category: string; sex: Sex; number: number }[];
  rows: {
    firstname: string;
    lastname: string;
    withdrawn: boolean;
    inputRule: InputRule;
    precision: number;
  }[];
};

export type ScanResult =
  | { kind: 'noPage' | 'noCode' | 'offline' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; sheet: ScannedSheet; readings: (ReadRow | null)[]; count: number };

const model = loadModel(stored);
// The worker's own scope. Its messages work like the other side's, typed with the DOM types.
const scope = self as unknown as Worker;

scope.onmessage = async ({
  data: { id, competitionId, photo },
}: MessageEvent<{ id: number; competitionId: string; photo: Blob }>) => {
  try {
    scope.postMessage({ id, result: await scanPhoto(competitionId, photo) });
  } catch {
    scope.postMessage({ id });
  }
};

/** Reads a photo of a page of the judging sheets and keeps its grades on the server for checking. */
async function scanPhoto(competitionId: string, photo: Blob): Promise<ScanResult> {
  const image = await loadPhoto(photo);
  const page = findPage(image);
  if (!page) return { kind: 'noPage' };
  const code = readQrCode(page.qrCode);
  if (!code) return { kind: 'noCode' };

  const url = `/api/competitions/${competitionId}/scans`;
  const found = await send<{ sheet: ScannedSheet }>(`${url}?${new URLSearchParams({ code })}`);
  if (!('sheet' in found)) return found;
  const { sheet } = found;

  const cells = page.cells({ attempts: sheet.attempts, rowCount: sheet.rows.length });
  const readings = sheet.rows.map((row, index) =>
    row.withdrawn ? null : readRow(model, cells[index], row),
  );

  const body = new FormData();
  body.set('code', code);
  const read = readings.flatMap((reading, row) => (reading ? [{ row, ...reading }] : []));
  body.set('rows', JSON.stringify(read));
  for (const { row } of read) {
    body.set(`image-${row}`, await rowImage(cells[row].map(({ image }) => image)), `${row}.png`);
  }
  const saved = await send<{ count: number }>(url, { method: 'POST', body });
  if (!('count' in saved)) return saved;
  return { kind: 'done', sheet, readings, count: saved.count };
}

/** The answer of the server, its message when it refused, or offline without an answer. */
async function send<Answer extends object>(
  url: string,
  init?: RequestInit,
): Promise<Answer | { kind: 'error'; message: string } | { kind: 'offline' }> {
  try {
    const answer = (await (await fetch(url, init)).json()) as Answer | { error: string } | null;
    if (answer && 'error' in answer) return { kind: 'error', message: answer.error };
    return answer ?? { kind: 'offline' };
  } catch {
    return { kind: 'offline' };
  }
}

/** A photo as a grey image, turned the way the camera was held (browsers do that by default). */
async function loadPhoto(photo: Blob): Promise<Gray> {
  const bitmap = await createImageBitmap(photo);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const context = new OffscreenCanvas(width, height).getContext('2d')!;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = context.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index++) {
    const pixel = index * 4;
    gray[index] = (data[pixel] * 299 + data[pixel + 1] * 587 + data[pixel + 2] * 114) / 1000;
  }
  return { width, height, data: gray };
}

/** The cells of a row side by side, at half their size, for whoever checks the reading. */
async function rowImage(cells: Gray[]) {
  const width = cells.reduce((sum, cell) => sum + cell.width, 0);
  const height = Math.max(...cells.map((cell) => cell.height));
  const full = new OffscreenCanvas(width, height);
  let left = 0;
  for (const cell of cells) {
    const pixels = new ImageData(cell.width, cell.height);
    for (let index = 0; index < cell.data.length; index++) {
      pixels.data.fill(cell.data[index], index * 4, index * 4 + 3);
      pixels.data[index * 4 + 3] = 255;
    }
    full.getContext('2d')!.putImageData(pixels, left, 0);
    left += cell.width;
  }
  const half = new OffscreenCanvas(Math.round(width / 2), Math.round(height / 2));
  half.getContext('2d')!.drawImage(full, 0, 0, half.width, half.height);
  return half.convertToBlob({ type: 'image/png' });
}
