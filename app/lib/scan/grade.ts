import { classify, GLYPH_SIZE, type DigitModel } from './digits';
import { BELOW_LINE, CROP_SCALE, inkMask, type Gray } from './sheet';

/** In thousandths, with the next likely values. Confidence is the probability of the reading. */
export type ReadGrade = { value: number; confidence: number; alternatives: number[] };

type Blob = { minX: number; maxX: number; minY: number; maxY: number; pixels: number[] };

/** Digits fill this many pixels of a glyph's longer side, as in MNIST. */
const GLYPH_BOX = 20;
/** How much a missing decimal point counts against a reading, as in "935" for 9.35. */
const MISSING_POINT = Math.log(0.2);
const ALL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** How much taking two neighbouring pieces as one digit counts against a reading. */
const MERGED = 0.5;
/** Pixels from the edge of a cell where table lines are: 1.5pt at the 4 pixels per point of readSheet. */
const EDGE = 6;

/** The grade written in a cell, or null when nothing readable is in it. */
export function readGrade(model: DigitModel, cell: Gray, precision: number): ReadGrade | null {
  const { ink, digits, point } = segment(cell);
  const pointX = point && centreX([point]);
  const classified = new Map<Blob[], Float32Array>();
  const probabilities = (group: Blob[]) => {
    if (!classified.has(group)) {
      classified.set(group, classify(model, toGlyph(ink, cell.width, group)));
    }
    return classified.get(group)!;
  };
  const read = (groups: Blob[][]) =>
    decodeGrade(
      groups.map(probabilities),
      pointX === null ? null : groups.filter((group) => centreX(group) < pointX).length,
      precision,
    );
  // Strokes of one digit can lie apart, like the bar of a 5. If they read better as one, they are,
  // but never across the point.
  const merged = digits.slice(1).map((_, index) => {
    const [left, right] = [digits[index], digits[index + 1]];
    if (pointX !== null && centreX(left) < pointX && pointX < centreX(right)) return null;
    const reading = read(digits.toSpliced(index, 2, [...left, ...right]));
    return reading && { ...reading, confidence: reading.confidence * MERGED };
  });
  const readings = [read(digits), ...merged].filter((reading) => reading !== null);
  if (readings.length === 0) return null;
  return readings.reduce((best, reading) =>
    reading.confidence > best.confidence ? reading : best,
  );
}

/**
 * The digits of a cell from left to right, each as the blobs it is made of, and the decimal point
 * if there is one: a small blob in the lower half of the digits.
 */
export function segment(cell: Gray): { ink: Uint8Array; digits: Blob[][]; point: Blob | null } {
  // Relative to the paper nearby, so a shadow over part of the cell is no ink.
  const ink = inkMask(cell, Math.round(cell.height / 2));
  removeLines(ink, cell.width, cell.height);
  // Below the line under the cell, what starts there belongs to the next row.
  const line = cell.height - BELOW_LINE * CROP_SCALE;
  // What is left of a line is long and thin, near the edge.
  const found = findBlobs(ink, cell.width).filter((blob) => {
    const width = blob.maxX - blob.minX + 1;
    const height = blob.maxY - blob.minY + 1;
    if (blob.minY > line) return false;
    const nearEdge =
      blob.minX <= 2 * EDGE ||
      blob.minY <= 2 * EDGE ||
      blob.maxX >= cell.width - 1 - 2 * EDGE ||
      blob.maxY >= cell.height - 1 - 2 * EDGE;
    return blob.pixels.length >= 3 && !(nearEdge && (width > 6 * height || height > 6 * width));
  });
  if (found.length === 0) return { ink, digits: [], point: null };

  const tallest = Math.max(...found.map(({ minY, maxY }) => maxY - minY + 1));
  const tall = found.filter(({ minY, maxY }) => maxY - minY + 1 >= 0.6 * tallest);
  const top = Math.min(...tall.map(({ minY }) => minY));
  const bottom = Math.max(...tall.map(({ maxY }) => maxY));
  const isPoint = ({ minX, maxX, minY, maxY }: Blob) =>
    maxY - minY + 1 < 0.4 * tallest &&
    maxX - minX + 1 < 0.6 * tallest &&
    (minY + maxY) / 2 > top + 0.55 * (bottom - top);
  const isMark = (blob: Blob) => !isPoint(blob) && blob.maxY - blob.minY + 1 < 0.3 * tallest;
  const points = found.filter(isPoint);

  // Strokes of one digit overlap horizontally, like the two of a 4.
  const groups: Blob[][] = [];
  for (const blob of found
    .filter((blob) => !isPoint(blob) && !isMark(blob))
    .toSorted((a, b) => a.minX - b.minX)) {
    const last = groups.at(-1);
    const right = last ? Math.max(...last.map(({ maxX }) => maxX)) : -Infinity;
    const left = last ? Math.min(...last.map(({ minX }) => minX)) : Infinity;
    const overlap = Math.min(right, blob.maxX) - Math.max(left, blob.minX) + 1;
    const narrower = Math.min(right - left + 1, blob.maxX - blob.minX + 1);
    if (last && overlap >= 0.5 * narrower) last.push(blob);
    else groups.push([blob]);
  }
  // Short strokes high up, like the bar of a 5, belong to the digit next to them. Others are specks.
  for (const mark of found.filter(isMark)) {
    const distance = (group: Blob[]) => Math.abs(centreX(group) - centreX([mark]));
    const nearest = groups.toSorted((a, b) => distance(a) - distance(b))[0];
    if (nearest && distance(nearest) < 0.5 * tallest) nearest.push(mark);
  }
  return {
    ink,
    digits: groups.flatMap((group) => splitTouching(group, ink, cell.width, bottom - top + 1)),
    // The largest, others are specks.
    point: points.toSorted((a, b) => b.pixels.length - a.pixels.length)[0] ?? null,
  };
}

/**
 * Digits written into each other are one blob, wider than a digit. It is cut where the least ink
 * is, near where equally wide digits would end.
 */
function splitTouching(group: Blob[], ink: ArrayLike<number>, width: number, height: number) {
  const minX = Math.min(...group.map((blob) => blob.minX));
  const maxX = Math.max(...group.map((blob) => blob.maxX));
  const groupWidth = maxX - minX + 1;
  const pieces = Math.min(3, Math.round(groupWidth / (0.65 * height)));
  if (groupWidth <= height || pieces < 2) return [group];

  const columns = new Float32Array(groupWidth);
  const pixels = group.flatMap((blob) => blob.pixels);
  for (const index of pixels) columns[(index % width) - minX] += ink[index];
  const cuts = Array.from({ length: pieces - 1 }, (_, cut) => {
    const ideal = Math.round(((cut + 1) * groupWidth) / pieces);
    const reach = Math.round(groupWidth / pieces / 4);
    let best = ideal;
    for (let x = ideal - reach; x <= ideal + reach; x++) if (columns[x] < columns[best]) best = x;
    return minX + best;
  });
  const parts = Array.from({ length: pieces }, () => [] as number[]);
  for (const index of pixels) {
    parts[cuts.filter((cut) => index % width >= cut).length].push(index);
  }
  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const xs = part.map((index) => index % width);
      const ys = part.map((index) => Math.floor(index / width));
      return [
        {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          pixels: part,
        },
      ];
    });
}

/**
 * The most likely grade for the digits' probabilities: up to 10, with at most `precision`
 * decimals. A missing point is allowed, it only makes a reading less likely.
 */
export function decodeGrade(
  probabilities: Float32Array[],
  pointAfter: number | null,
  precision: number,
): ReadGrade | null {
  const logs = probabilities.map((digit) => Array.from(digit, (p) => Math.log(Math.max(p, 1e-6))));
  const readings: { digits: number[]; whole: number; score: number }[] = [];
  for (const whole of pointAfter === null ? [1, 2] : [pointAfter]) {
    const decimals = logs.length - whole;
    if (whole < 1 || whole > 2 || decimals < 0 || decimals > precision) continue;
    // 10 is the only grade with two digits before the point, and nothing after it.
    const allowed = (index: number) => (whole === 2 ? [index === 0 ? 1 : 0] : ALL_DIGITS);
    const penalty = pointAfter === null && decimals > 0 ? MISSING_POINT : 0;
    const ranked = logs.map((log, index) => allowed(index).toSorted((a, b) => log[b] - log[a]));
    const best = ranked.map((digits) => digits[0]);
    const score = best.reduce((sum, digit, index) => sum + logs[index][digit], penalty);
    readings.push({ digits: best, whole, score });
    // The next likely readings differ in one digit.
    for (const [index, digits] of ranked.entries()) {
      if (digits.length < 2) continue;
      const next = digits[1];
      readings.push({
        digits: best.with(index, next),
        whole,
        score: score - logs[index][best[index]] + logs[index][next],
      });
    }
  }
  if (readings.length === 0) return null;
  const values = [
    ...new Set(
      readings
        .toSorted((a, b) => b.score - a.score)
        .map(({ digits, whole }) => {
          const decimals = digits.slice(whole).join('').padEnd(3, '0');
          return Number(digits.slice(0, whole).join('')) * 1000 + Number(decimals);
        }),
    ),
  ];
  const confidence = Math.exp(Math.max(...readings.map(({ score }) => score)));
  return { value: values[0], confidence, alternatives: values.slice(1, 3) };
}

/**
 * Clears the table's lines: rows or columns that are mostly ink. People write on the line, so
 * where a stroke crosses it, ink on both sides, the line stays to keep the digit whole.
 */
function removeLines(ink: Uint8Array, width: number, height: number) {
  const at = (x: number, y: number) => ink[y * width + x];
  const rows = Array.from({ length: height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < width; x++) count += at(x, y);
    return count > 0.6 * width;
  });
  const columns = Array.from({ length: width }, (_, x) => {
    let count = 0;
    for (let y = 0; y < height; y++) count += at(x, y);
    return count > 0.6 * height;
  });
  const cleared = new Uint8Array(ink.length);
  for (let y = 0; y < height; y++) {
    if (!rows[y]) continue;
    let above = y;
    while (above > 0 && rows[above - 1]) above--;
    let below = y;
    while (below < height - 1 && rows[below + 1]) below++;
    for (let x = 0; x < width; x++) {
      const crossed = above > 0 && below < height - 1 && at(x, above - 1) && at(x, below + 1);
      if (!crossed) cleared[y * width + x] = 1;
    }
  }
  for (let x = 0; x < width; x++) {
    if (!columns[x]) continue;
    let left = x;
    while (left > 0 && columns[left - 1]) left--;
    let right = x;
    while (right < width - 1 && columns[right + 1]) right++;
    for (let y = 0; y < height; y++) {
      const crossed = left > 0 && right < width - 1 && at(left - 1, y) && at(right + 1, y);
      if (!crossed) cleared[y * width + x] = 1;
    }
  }
  for (let index = 0; index < ink.length; index++) if (cleared[index]) ink[index] = 0;
}

/** 8-connected blobs of ink. */
function findBlobs(ink: ArrayLike<number>, width: number) {
  const height = ink.length / width;
  const seen = new Uint8Array(ink.length);
  const blobs: Blob[] = [];
  for (let start = 0; start < ink.length; start++) {
    if (ink[start] === 0 || seen[start]) continue;
    seen[start] = 1;
    const blob: Blob = { minX: width, maxX: 0, minY: height, maxY: 0, pixels: [] };
    const stack = [start];
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      blob.pixels.push(index);
      blob.minX = Math.min(blob.minX, x);
      blob.maxX = Math.max(blob.maxX, x);
      blob.minY = Math.min(blob.minY, y);
      blob.maxY = Math.max(blob.maxY, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (ink[next] > 0 && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    blobs.push(blob);
  }
  return blobs;
}

function centreX(group: Blob[]) {
  return (
    (Math.min(...group.map(({ minX }) => minX)) + Math.max(...group.map(({ maxX }) => maxX))) / 2
  );
}

/** All ink of an image as one glyph, for training. */
export function glyphOf(ink: ArrayLike<number>, width: number) {
  const blob: Blob = { minX: width, maxX: -1, minY: Infinity, maxY: -1, pixels: [] };
  for (let index = 0; index < ink.length; index++) {
    if (ink[index] === 0) continue;
    const x = index % width;
    const y = (index - x) / width;
    blob.pixels.push(index);
    blob.minX = Math.min(blob.minX, x);
    blob.maxX = Math.max(blob.maxX, x);
    blob.minY = Math.min(blob.minY, y);
    blob.maxY = Math.max(blob.maxY, y);
  }
  if (blob.pixels.length === 0) return new Float32Array(GLYPH_SIZE * GLYPH_SIZE);
  return toGlyph(ink, width, [blob]);
}

/**
 * The blobs as an MNIST glyph: scaled so the longer side is 20 pixels and placed with its centre
 * of mass in the middle of 28×28.
 */
function toGlyph(ink: ArrayLike<number>, width: number, group: Blob[]) {
  const minX = Math.min(...group.map((blob) => blob.minX));
  const maxX = Math.max(...group.map((blob) => blob.maxX));
  const minY = Math.min(...group.map((blob) => blob.minY));
  const maxY = Math.max(...group.map((blob) => blob.maxY));
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const own = new Float32Array(boxWidth * boxHeight);
  for (const blob of group) {
    for (const index of blob.pixels) {
      const x = index % width;
      const y = (index - x) / width;
      own[(y - minY) * boxWidth + x - minX] = ink[index];
    }
  }

  const scale = GLYPH_BOX / Math.max(boxWidth, boxHeight);
  const scaledWidth = Math.max(1, Math.round(boxWidth * scale));
  const scaledHeight = Math.max(1, Math.round(boxHeight * scale));
  // Several samples per pixel when shrinking, so thin strokes are not lost.
  const samples = Math.max(1, Math.ceil(1 / scale));
  const scaled = new Float32Array(scaledWidth * scaledHeight);
  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      let sum = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const sourceX = Math.floor((x + (sx + 0.5) / samples) / scale);
          const sourceY = Math.floor((y + (sy + 0.5) / samples) / scale);
          sum += own[Math.min(boxHeight - 1, sourceY) * boxWidth + Math.min(boxWidth - 1, sourceX)];
        }
      }
      scaled[y * scaledWidth + x] = sum / samples ** 2;
    }
  }

  let mass = 0;
  let massX = 0;
  let massY = 0;
  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      const value = scaled[y * scaledWidth + x];
      mass += value;
      massX += value * x;
      massY += value * y;
    }
  }
  const offsetX = Math.round(GLYPH_SIZE / 2 - massX / Math.max(mass, 1e-6) - 0.5);
  const offsetY = Math.round(GLYPH_SIZE / 2 - massY / Math.max(mass, 1e-6) - 0.5);
  const glyph = new Float32Array(GLYPH_SIZE * GLYPH_SIZE);
  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      const gx = x + offsetX;
      const gy = y + offsetY;
      if (gx < 0 || gy < 0 || gx >= GLYPH_SIZE || gy >= GLYPH_SIZE) continue;
      glyph[gy * GLYPH_SIZE + gx] = scaled[y * scaledWidth + x];
    }
  }
  const max = Math.max(...glyph);
  return max > 0 ? glyph.map((value) => value / max) : glyph;
}
