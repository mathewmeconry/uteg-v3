import { describe, expect, it } from 'vitest';
import { homography, project } from './homography';

describe('homography', () => {
  it('maps four points to theirs, and lines to lines', () => {
    const from = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    const to = [
      { x: 105, y: 40 },
      { x: 300, y: 10 },
      { x: 320, y: 420 },
      { x: 90, y: 380 },
    ];
    const matrix = homography(from, to);
    for (const [index, point] of from.entries()) {
      const { x, y } = project(matrix, point);
      expect(x).toBeCloseTo(to[index].x, 6);
      expect(y).toBeCloseTo(to[index].y, 6);
    }
    // The middle of an edge stays on it.
    const middle = project(matrix, { x: 5, y: 0 });
    const slope = (to[1].y - to[0].y) / (to[1].x - to[0].x);
    expect(middle.y - to[0].y).toBeCloseTo(slope * (middle.x - to[0].x), 6);
  });
});
