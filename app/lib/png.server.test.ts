import { deflateSync } from 'node:zlib';
import { createPng } from '~/tests/images';
import { isSafePng } from './png.server';

describe('isSafePng', () => {
  it.each([
    ['with transparency', createPng(10, 10)],
    ['without', createPng(10, 10, { color: 2 })],
    ['with a palette of 1 bit', createPng(9, 10, { color: 3, depth: 1 })],
    ['with 16 bits', createPng(10, 10, { depth: 16 })],
    // 1 × 1 pixels only have one pass, 5 × 5 have six.
    ['interlaced', createPng(1, 1, { interlace: 1, pixels: Buffer.alloc(5) })],
    [
      'larger interlaced',
      createPng(5, 5, {
        interlace: 1,
        color: 0,
        pixels: Buffer.alloc(2 + 2 + (1 + 2) + 2 * (1 + 1) + (1 + 3) + 3 * (1 + 2) + 2 * (1 + 5)),
      }),
    ],
    ['of 4000 pixels', createPng(4000, 4000)],
  ])('accepts images %s', async (_name, file) => {
    expect(await isSafePng(file)).toBe(true);
  });

  it.each([
    ['much more data than the header says', createPng(10, 10, { pixels: Buffer.alloc(8e6) })],
    ['a byte more', createPng(10, 10, { pixels: Buffer.alloc(411) })],
    ['less data', createPng(10, 10, { pixels: Buffer.alloc(100) })],
    ['no compressed data', createPng(10, 10, { idat: Buffer.from('garbage') })],
    [
      'compressed data cut off',
      createPng(10, 10, { idat: deflateSync(Buffer.alloc(410)).subarray(0, 8) }),
    ],
    ['no pixels', createPng(0, 10)],
    ['an unknown color', createPng(10, 10, { color: 5 })],
    ['too many pixels', createPng(4000, 4001, { idat: Buffer.alloc(0) })],
    ['16 bits and many pixels', createPng(4000, 4000, { depth: 16, idat: Buffer.alloc(0) })],
    ['only a signature', createPng().slice(0, 8)],
    ['a chunk cut off', createPng().slice(0, 45)],
  ])('rejects %s', async (_name, file) => {
    expect(await isSafePng(file)).toBe(false);
  });

  it('rejects a second header', async () => {
    const file = createPng(10, 10);
    const header = file.slice(8, 33);
    const twice = new Uint8Array([...file.slice(0, 33), ...header, ...file.slice(33)]);
    expect(await isSafePng(twice)).toBe(false);
  });
});
