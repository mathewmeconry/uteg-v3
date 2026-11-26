import { describe, expect, it } from 'vitest';
import {
  cornerCentres,
  gradeCells,
  qrCodeRect,
  SHEET,
  type Point,
  type Rect,
} from '~/lib/judgingSheet';
import { homography, project } from './homography';
import { findPage, type Gray } from './sheet';

const PAGE: Point[] = [
  { x: 0, y: 0 },
  { x: SHEET.width, y: 0 },
  { x: SHEET.width, y: SHEET.height },
  { x: 0, y: SHEET.height },
];

/** 2 attempts and the final grade, written into the second attempt of row 3 and the final of row 5. */
const LAYOUT = { attempts: 2, rowCount: 5 };
const cells = gradeCells(LAYOUT.attempts, LAYOUT.rowCount);
const WRITTEN = [cells[2][1], cells[4][2]];

function inside({ x, y }: Point, rect: Rect) {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** Something like a 0: a ring, not a solid blob. */
function isWritten(point: Point) {
  return WRITTEN.some((cell) => {
    const centre = { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 };
    const outer = { x: centre.x - 6, y: centre.y - 7, width: 12, height: 14 };
    const inner = { x: outer.x + 1.5, y: outer.y + 1.5, width: 9, height: 11 };
    return inside(point, outer) && !inside(point, inner);
  });
}

function isInk(point: Point, withQrCode: boolean) {
  const half = SHEET.cornerSize / 2;
  const corner = cornerCentres().some(
    ({ x, y }) => Math.abs(point.x - x) <= half && Math.abs(point.y - y) <= half,
  );
  const qr = qrCodeRect();
  // Modules of 4pt, not touching each other.
  const module =
    withQrCode &&
    inside(point, qr) &&
    (Math.floor((point.x - qr.x) / 4) + Math.floor((point.y - qr.y) / 4)) % 2 === 0;
  // The line under the table header.
  const line = point.x > SHEET.paddingX && point.x < SHEET.width - SHEET.paddingX;
  const header = line && Math.abs(point.y - (cells[0][0].y - 1)) < 0.75;
  return corner || module || header || isWritten(point);
}

/** A photo of the page, whose corners land on `corners`, on a grey table. */
function photo(width: number, height: number, corners: Point[], withQrCode = true): Gray {
  const toPage = homography(corners, PAGE);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = project(toPage, { x: x + 0.5, y: y + 0.5 });
      const onPage = inside(point, { x: 0, y: 0, width: SHEET.width, height: SHEET.height });
      data[y * width + x] = !onPage ? 110 : isInk(point, withQrCode) ? 20 : 235;
    }
  }
  return { width, height, data };
}

function inked(image: Gray) {
  const page = findPage(image);
  expect(page).not.toBeNull();
  return page!.cells(LAYOUT).map((row) => row.map((cell) => cell.inked));
}

const EXPECTED = [
  [false, false, false],
  [false, false, false],
  [false, true, false],
  [false, false, false],
  [false, false, true],
];

describe('findPage', () => {
  it('finds the written cells of a page photographed at an angle', () => {
    const corners = [
      { x: 90, y: 70 },
      { x: 820, y: 20 },
      { x: 880, y: 1230 },
      { x: 30, y: 1180 },
    ];
    expect(inked(photo(900, 1250, corners))).toEqual(EXPECTED);
  });

  it('turns pages upside down and sideways', () => {
    const upsideDown = [
      { x: 850, y: 1210 },
      { x: 50, y: 1220 },
      { x: 60, y: 40 },
      { x: 860, y: 30 },
    ];
    expect(inked(photo(900, 1250, upsideDown))).toEqual(EXPECTED);
    const sideways = [
      { x: 1210, y: 40 },
      { x: 1215, y: 860 },
      { x: 40, y: 855 },
      { x: 35, y: 45 },
    ];
    expect(inked(photo(1250, 900, sideways))).toEqual(EXPECTED);
  });

  it('cuts out the cells straight', () => {
    const corners = [
      { x: 90, y: 70 },
      { x: 820, y: 20 },
      { x: 880, y: 1230 },
      { x: 30, y: 1180 },
    ];
    const cell = findPage(photo(900, 1250, corners))!.cells(LAYOUT)[2][1].image;
    const dark = (x: number, y: number) =>
      cell.data[Math.round(y) * cell.width + Math.round(x)] < 128;
    // The ring's left edge is dark in its middle, its centre light. Below the cell, more is cut out.
    const scale = cell.width / cells[2][1].width;
    const middle = (cells[2][1].height / 2) * scale;
    expect(dark(cell.width / 2 - 5.25 * scale, middle)).toBe(true);
    expect(dark(cell.width / 2, middle)).toBe(false);
  });

  it('gives up without corner squares', () => {
    const blank = { width: 200, height: 300, data: new Uint8Array(200 * 300).fill(235) };
    expect(findPage(blank)).toBeNull();
  });

  it('takes no four squares without a QR code for a page', () => {
    const corners = [
      { x: 90, y: 70 },
      { x: 820, y: 20 },
      { x: 880, y: 1230 },
      { x: 30, y: 1180 },
    ];
    expect(findPage(photo(900, 1250, corners, false))).toBeNull();
  });

  it('straightens the QR code', () => {
    const qrCode = findPage(
      photo(1250, 900, [
        { x: 1210, y: 40 },
        { x: 1215, y: 860 },
        { x: 40, y: 855 },
        { x: 35, y: 45 },
      ]),
    )!.qrCode();
    // Its first module, 4pt at 4 pixels per point, after 8pt of white.
    const at = (x: number, y: number) => qrCode.data[y * qrCode.width + x];
    expect(at(10, 10)).toBeGreaterThan(200);
    expect(at(34, 34)).toBeLessThan(50);
    expect(at(50, 34)).toBeGreaterThan(200);
  });
});
