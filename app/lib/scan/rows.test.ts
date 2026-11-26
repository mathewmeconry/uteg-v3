import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import stored from './digitModel.json';
import { loadModel } from './digits';
import { readQrCode, readRow } from './rows';
import type { Gray, ScannedCell } from './sheet';

const model = loadModel(stored);

type Box = [x: number, y: number, width: number, height: number];

/** A cell with dark boxes, 100 high like a cut out one: the row's line is at 68. */
function cell(boxes: Box[]): ScannedCell {
  const width = 200;
  const data = new Uint8Array(width * 100).fill(235);
  for (const [x, y, w, h] of boxes) {
    for (let row = y; row < y + h; row++) data.fill(30, row * width + x, row * width + x + w);
  }
  return { image: { width, height: 100, data }, inked: boxes.length > 0 };
}

function ring(x: number): Box[] {
  return [
    [x, 20, 24, 4],
    [x, 46, 24, 4],
    [x, 20, 4, 30],
    [x + 20, 20, 4, 30],
  ];
}

/** "10.00" as a bar and rings. */
const TEN = cell([[24, 20, 5, 30], ...ring(42), [74, 45, 5, 5], ...ring(88), ...ring(124)]);
const EMPTY = cell([]);
const SINGLE = { inputRule: { attempts: 1, aggregation: 'NONE' as const }, precision: 2 };
const VAULT = { inputRule: { attempts: 2, aggregation: 'MAX' as const }, precision: 2 };

describe('readRow', () => {
  it('reads the grade of a sheet with one column', () => {
    expect(readRow(model, [TEN], SINGLE)?.value).toBe(10000);
    expect(readRow(model, [EMPTY], SINGLE)).toBeNull();
  });

  it('takes a single grade from either column of a sheet with attempts', () => {
    expect(readRow(model, [TEN, EMPTY, EMPTY], SINGLE)?.value).toBe(10000);
    expect(readRow(model, [EMPTY, EMPTY, TEN], SINGLE)?.value).toBe(10000);
  });

  it('needs every attempt, and trusts them more with a matching final grade', () => {
    expect(readRow(model, [TEN, EMPTY, TEN], VAULT)).toBeNull();
    const without = readRow(model, [TEN, TEN, EMPTY], VAULT)!;
    expect(without.attempts).toEqual([10000, 10000]);
    const withFinal = readRow(model, [TEN, TEN, TEN], VAULT)!;
    expect(withFinal.confidence).toBeGreaterThanOrEqual(without.confidence);
  });
});

describe('readQrCode', () => {
  it('reads a straightened QR code', () => {
    const text = 'UTEG1/RECK/0/0/0840FE5C/01JD0000000000000000000001';
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const scale = 4;
    const size = (modules.size + 8) * scale;
    const image: Gray = { width: size, height: size, data: new Uint8Array(size * size).fill(255) };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / scale) - 4;
        const column = Math.floor(x / scale) - 4;
        const inside = row >= 0 && column >= 0 && row < modules.size && column < modules.size;
        if (inside && modules.get(row, column)) image.data[y * size + x] = 0;
      }
    }
    expect(readQrCode(image)).toBe(text);
    expect(readQrCode({ ...image, data: new Uint8Array(size * size).fill(255) })).toBeNull();
  });
});
