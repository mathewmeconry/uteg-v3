import { describe, expect, it } from 'vitest';
import stored from './digitModel.json';
import { CLASSES, loadModel, SEPARATOR } from './digits';
import { decodeGrade, readGrade, segment } from './grade';
import type { Gray } from './sheet';

type Box = [x: number, y: number, width: number, height: number];

/** A white cell with dark boxes. */
function cell(boxes: Box[]): Gray {
  const width = 200;
  const height = 100;
  const data = new Uint8Array(width * height).fill(235);
  for (const [x, y, w, h] of boxes) {
    for (let row = y; row < y + h; row++) data.fill(30, row * width + x, row * width + x + w);
  }
  return { width, height, data };
}

/** The outline of a digit, `width` wide and 50 high. */
function ring(x: number, width = 24): Box[] {
  return [
    [x, 20, width, 4],
    [x, 66, width, 4],
    [x, 20, 4, 50],
    [x + width - 4, 20, 4, 50],
  ];
}

/** Mostly the digit or the separator, a bit of the others. `second` gets a fair share. */
function probabilities(digit: number, second?: number) {
  return Float32Array.from({ length: CLASSES }, (_, index) =>
    index === digit ? 0.7 : index === second ? 0.25 : 0.05 / (CLASSES - 1),
  );
}

function decode(digits: number[], pointAfter: number | null, precision = 2) {
  return decodeGrade(
    digits.map((digit) => probabilities(digit)),
    pointAfter,
    precision,
  );
}

describe('decodeGrade', () => {
  it('reads digits around the point', () => {
    expect(decode([9, 3, 5], 1)?.value).toBe(9350);
    expect(decode([9, 3, 5, 0], 1, 3)?.value).toBe(9350);
    expect(decode([8], null)?.value).toBe(8000);
  });

  it('reads a grade without its point, but trusts it less', () => {
    const without = decode([9, 3, 5], null)!;
    expect(without.value).toBe(9350);
    expect(without.confidence).toBeLessThan(decode([9, 3, 5], 1)!.confidence);
  });

  it('only allows 10 with two digits before the point', () => {
    expect(decode([1, 0], null)?.value).toBe(10000);
    expect(decode([1, 0, 0, 0], 2)?.value).toBe(10000);
    // 1.0 is likelier than 10 with a point after the first digit.
    expect(decode([1, 0], 1)?.value).toBe(1000);
    expect(decode([9, 5], 2)!.confidence).toBeLessThan(0.001);
  });

  it('takes 10.0 without its point for 10, not for 1.00', () => {
    expect(decode([1, 0, 0], null)?.value).toBe(10000);
    expect(decode([1, 0, 0, 0], null, 3)?.value).toBe(10000);
  });

  it('offers the next likely reading', () => {
    const grade = decodeGrade([probabilities(9), probabilities(3, 8), probabilities(5)], 1, 2);
    expect(grade?.value).toBe(9350);
    expect(grade?.alternatives[0]).toBe(9850);
  });

  it('takes a comma for the point, but no 1', () => {
    expect(decode([9, SEPARATOR, 3, 1], null)?.value).toBe(9310);
    expect(decode([1, 0, SEPARATOR, 0, 0], null)?.value).toBe(10000);
    expect(decode([9, 1, 8], null)?.value).toBe(9180);
  });

  it('gives up on more decimals than allowed', () => {
    expect(decode([9, 3, 5, 5], 1)).toBeNull();
  });
});

describe('segment', () => {
  it('finds the digits and the point, not the lines of the table', () => {
    const { digits, point } = segment(
      cell([[0, 0, 200, 2], ...ring(20), [52, 64, 5, 5], ...ring(64), ...ring(100)]),
    );
    expect(digits.map((digit) => digit[0].minX)).toEqual([20, 64, 100]);
    expect(point?.minX).toBe(52);
  });

  it('takes no speck after the digits for the point', () => {
    const { digits, point } = segment(cell([...ring(20), ...ring(64), [100, 64, 5, 5]]));
    expect(digits).toHaveLength(2);
    expect(point).toBeNull();
  });

  it('removes a table line that is not quite straight', () => {
    // 2 pixels thick, 3 lower at its right end, through both digits.
    const line: Box[] = [0, 50, 100, 150].map((x, step) => [x, 55 + step, 50, 2]);
    expect(segment(cell([...ring(20), ...ring(64), ...line])).digits).toHaveLength(2);
  });

  it('cuts digits written into each other', () => {
    const touching = [20, 49, 78].flatMap((x) => ring(x, 30));
    expect(segment(cell(touching)).digits).toHaveLength(3);
  });

  it('keeps strokes of one digit together', () => {
    // Like a 4: a stroke and a separate vertical one through it.
    const { digits, point } = segment(
      cell([
        [30, 20, 4, 30],
        [30, 46, 30, 4],
        [50, 25, 4, 45],
      ]),
    );
    expect(digits).toHaveLength(1);
    expect(point).toBeNull();
  });

  it('finds nothing in an empty cell', () => {
    expect(segment(cell([[0, 98, 200, 2]])).digits).toEqual([]);
  });
});

/** An oval 0, 24 wide and 50 high: a square one reads as a 4 as well. */
function oval(x: number): Box[] {
  return Array.from({ length: 50 }, (_, row) => {
    const y = (row + 0.5 - 25) / 25;
    const outer = 12 * Math.sqrt(1 - y * y);
    const inner = Math.abs(y) < 0.85 ? 8 * Math.sqrt(1 - (y / 0.85) ** 2) : 0;
    const left = Math.round(12 - outer);
    const width = Math.max(1, Math.round(outer - inner));
    return [
      [x + left, 20 + row, width, 1],
      [x + 24 - left - width, 20 + row, width, 1],
    ] satisfies Box[];
  }).flat();
}

describe('readGrade', () => {
  it('reads 10.00 drawn as a bar and ovals', () => {
    const ten = cell([[24, 20, 5, 50], ...oval(42), [74, 64, 5, 5], ...oval(88), ...oval(124)]);
    expect(readGrade(loadModel(stored), ten, 2)?.value).toBe(10000);
  });
});
