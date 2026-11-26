import { describe, expect, it } from 'vitest';
import stored from './digitModel.json';
import { classify, loadModel } from './digits';
import { glyphOf } from './grade';

const model = loadModel(stored);

/** An image of 60×100 pixels with ink where `isInk` says. */
function draw(isInk: (x: number, y: number) => boolean) {
  return glyphOf(
    Float32Array.from({ length: 60 * 100 }, (_, index) =>
      isInk(index % 60, Math.floor(index / 60)) ? 1 : 0,
    ),
    60,
  );
}

function read(glyph: Float32Array) {
  const probabilities = classify(model, glyph);
  return probabilities.indexOf(Math.max(...probabilities));
}

describe('the digit model', () => {
  it('reads a 0 and a 1', () => {
    const zero = draw((x, y) => {
      const distance = ((x - 30) / 22) ** 2 + ((y - 50) / 40) ** 2;
      return distance <= 1 && distance >= 0.6;
    });
    expect(read(zero)).toBe(0);
    expect(read(draw((x, y) => x >= 27 && x <= 33 && y >= 10 && y <= 90))).toBe(1);
  });
});
