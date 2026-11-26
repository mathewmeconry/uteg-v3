import type { Point } from '~/lib/judgingSheet';

/** A projective map as a 3×3 matrix by rows. */
export type Homography = number[];

/** The map that takes each of four points to the point at the same index of `to`. */
export function homography(from: readonly Point[], to: readonly Point[]): Homography {
  const rows = from.flatMap(({ x, y }, index) => {
    const { x: u, y: v } = to[index];
    return [
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    ];
  });
  return [...solve(rows), 1];
}

export function project(matrix: Homography, { x, y }: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const w = g * x + h * y + i;
  return { x: (a * x + b * y + c) / w, y: (d * x + e * y + f) / w };
}

/** Gauss-Jordan elimination of an augmented matrix. */
function solve(rows: number[][]) {
  const size = rows.length;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const top = rows[column];
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = rows[row][column] / top[column];
      rows[row] = rows[row].map((value, index) => value - factor * top[index]);
    }
  }
  return rows.map((row, index) => row[size] / row[index]);
}
