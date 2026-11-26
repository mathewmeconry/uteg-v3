import { cornerCentres, gradeCells, qrCodeRect, type Point, type Rect } from '~/lib/judgingSheet';
import { homography, project, type Homography } from './homography';

/** A grey image, 0 is black. */
export type Gray = { width: number; height: number; data: Uint8Array };

export type ScannedCell = { image: Gray; inked: boolean };

/** Pixels per point of the cut out cells. */
const CROP_SCALE = 4;

/**
 * The grade cells of a photographed page, by row as in `gradeCells`, or null when its corner
 * squares are not found. Cells without ink are not `inked`.
 */
export function readSheet(
  image: Gray,
  { attempts, rowCount }: { attempts: number; rowCount: number },
): ScannedCell[][] | null {
  const toPhoto = locatePage(inkMask(image), image.width);
  if (!toPhoto) return null;
  return gradeCells(attempts, rowCount).map((row) =>
    row.map((rect) => {
      const cell = crop(image, toPhoto, rect);
      return { image: cell, inked: hasWriting(cell) };
    }),
  );
}

/** Whether a few strokes are in a cut out cell, away from the lines around it. */
function hasWriting(cell: Gray) {
  const mask = inkMask(cell, Math.round(cell.height / 2));
  const margin = 3 * CROP_SCALE;
  let ink = 0;
  for (let y = margin; y < cell.height - margin; y++) {
    for (let x = margin; x < cell.width - margin; x++) ink += mask[y * cell.width + x];
  }
  return ink > 0.002 * (cell.width - 2 * margin) * (cell.height - 2 * margin);
}

/**
 * Maps points of the page to the photo. The corner squares are the largest filled squares, and
 * the QR code at the top right tells which way up the page is.
 */
function locatePage(mask: Uint8Array, width: number): Homography | null {
  const squares = findSquares(mask, width).slice(0, 4);
  if (squares.length < 4 || squares[3].size < squares[0].size / 4) return null;
  const centre = {
    x: squares.reduce((sum, { x }) => sum + x, 0) / 4,
    y: squares.reduce((sum, { y }) => sum + y, 0) / 4,
  };
  // Clockwise on the photo, as the corners of the page are.
  const found = squares.toSorted(
    (a, b) =>
      Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(b.y - centre.y, b.x - centre.x),
  );
  const corners = cornerCentres();
  const turns = [0, 1, 2, 3].map((turn) =>
    homography(
      corners,
      corners.map((_, index) => found[(index + turn) % 4]),
    ),
  );
  const ink = turns.map((turn) => inkShare(mask, width, turn, qrCodeRect()));
  const [best, second] = ink.toSorted((a, b) => b - a);
  // About half of a QR code is ink. Without one, the squares were something else.
  if (best < 0.3 || best < 1.5 * second) return null;
  return turns[ink.indexOf(best)];
}

/**
 * 1 for ink. A pixel is ink when it is clearly darker than its surroundings within `half` pixels,
 * so shadows do not matter (Bradley's threshold). The default is larger than the corner squares,
 * which would otherwise be their own surroundings. Photos up to 16 megapixels.
 */
export function inkMask(
  { width, height, data }: Gray,
  half = Math.max(8, Math.round(Math.max(width, height) / 16)),
) {
  const sums = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x];
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
    }
  }
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - half);
    const bottom = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - half);
      const right = Math.min(width, x + half + 1);
      const sum =
        sums[bottom * (width + 1) + right] -
        sums[top * (width + 1) + right] -
        sums[bottom * (width + 1) + left] +
        sums[top * (width + 1) + left];
      const mean = sum / ((bottom - top) * (right - left));
      mask[y * width + x] = data[y * width + x] < mean * 0.85 ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Blobs of ink that are solid around their centre and about as wide as high, largest first. Letters
 * and the QR code have holes there, lines are too long.
 */
function findSquares(mask: Uint8Array, width: number) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const squares: (Point & { size: number })[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack[0] = start;
    let top = 1;
    let size = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    while (top > 0) {
      const index = stack[--top];
      const x = index % width;
      const y = (index - x) / width;
      size++;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      // Without an array per pixel, there are millions.
      if (x > 0 && mask[index - 1] && !seen[index - 1]) {
        seen[index - 1] = 1;
        stack[top++] = index - 1;
      }
      if (x < width - 1 && mask[index + 1] && !seen[index + 1]) {
        seen[index + 1] = 1;
        stack[top++] = index + 1;
      }
      if (index >= width && mask[index - width] && !seen[index - width]) {
        seen[index - width] = 1;
        stack[top++] = index - width;
      }
      if (index + width < mask.length && mask[index + width] && !seen[index + width]) {
        seen[index + width] = 1;
        stack[top++] = index + width;
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const height = mask.length / width;
    // What touches the edge is the table under the page.
    const atEdge = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    if (
      atEdge ||
      boxWidth < 5 ||
      boxHeight < 5 ||
      boxWidth > 2 * boxHeight ||
      boxHeight > 2 * boxWidth
    ) {
      continue;
    }
    const centre = { x: sumX / size, y: sumY / size };
    if (isSolid(mask, width, centre, 0.3 * Math.sqrt(size))) squares.push({ ...centre, size });
  }
  return squares.toSorted((a, b) => b.size - a.size);
}

/** Whether nearly all of a square around a point is ink. Holds for squares turned any way. */
function isSolid(mask: Uint8Array, width: number, { x, y }: Point, half: number) {
  const height = mask.length / width;
  let ink = 0;
  let total = 0;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const px = Math.round(x + dx);
      const py = Math.round(y + dy);
      if (px >= 0 && py >= 0 && px < width && py < height) ink += mask[py * width + px];
      total++;
    }
  }
  return ink >= 0.95 * total;
}

/** The share of ink in an area of the page, from points on a grid. */
function inkShare(mask: Uint8Array, width: number, toPhoto: Homography, area: Rect) {
  const steps = 24;
  const height = mask.length / width;
  let ink = 0;
  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      const { x, y } = project(toPhoto, {
        x: area.x + ((column + 0.5) / steps) * area.width,
        y: area.y + ((row + 0.5) / steps) * area.height,
      });
      const px = Math.round(x);
      const py = Math.round(y);
      if (px >= 0 && px < width && py >= 0 && py < height) ink += mask[py * width + px];
    }
  }
  return ink / steps ** 2;
}

/** An area of the page as a straight image, sampled between pixels. */
function crop(image: Gray, toPhoto: Homography, area: Rect): Gray {
  const width = Math.round(area.width * CROP_SCALE);
  const height = Math.round(area.height * CROP_SCALE);
  const data = new Uint8Array(width * height).fill(255);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const { x, y } = project(toPhoto, {
        x: area.x + (column + 0.5) / CROP_SCALE,
        y: area.y + (row + 0.5) / CROP_SCALE,
      });
      const left = Math.floor(x);
      const top = Math.floor(y);
      if (left < 0 || top < 0 || left + 1 >= image.width || top + 1 >= image.height) continue;
      const fx = x - left;
      const fy = y - top;
      const index = top * image.width + left;
      const above = image.data[index] * (1 - fx) + image.data[index + 1] * fx;
      const below =
        image.data[index + image.width] * (1 - fx) + image.data[index + image.width + 1] * fx;
      data[row * width + column] = above * (1 - fy) + below * fy;
    }
  }
  return { width, height, data };
}
