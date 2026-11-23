import { crc32, deflateSync } from 'node:zlib';
import { createPng } from '~/tests/images';
import { cleanPng } from './png.server';

const PALETTE = { type: 'PLTE', content: Buffer.alloc(6) };

/** Adds chunks after the header. */
function addChunks(file: Uint8Array, ...chunks: { type: string; content: Buffer }[]) {
  const parts = chunks.map(({ type, content }) => {
    const chunk = Buffer.alloc(content.length + 12);
    chunk.writeUInt32BE(content.length, 0);
    chunk.write(type, 4);
    chunk.set(content, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), content.length + 8);
    return chunk;
  });
  return new Uint8Array(Buffer.concat([file.slice(0, 33), ...parts, file.slice(33)]));
}

describe('cleanPng', () => {
  it.each([
    ['with transparency', createPng(10, 10)],
    ['without', createPng(10, 10, { color: 2 })],
    ['with a palette of 1 bit', addChunks(createPng(9, 10, { color: 3, depth: 1 }), PALETTE)],
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
  ])('accepts images %s and keeps them', async (_name, file) => {
    // toEqual is slow for large arrays.
    expect(Buffer.from(file).equals((await cleanPng(file))!)).toBe(true);
  });

  it('leaves out everything but the picture', async () => {
    const file = createPng(10, 10);
    const transparency = { type: 'tRNS', content: Buffer.alloc(2) };
    const extra = ['tEXt', 'zTXt', 'iCCP', 'eXIf', 'acTL', 'fdAT', 'abCd'].map((type) => ({
      type,
      content: Buffer.alloc(100),
    }));
    const full = addChunks(file, ...extra, PALETTE, transparency);
    const trailing = new Uint8Array([...full, 1, 2, 3]);
    expect(await cleanPng(trailing)).toEqual(addChunks(file, PALETTE, transparency));
  });

  it('leaves out what follows the compressed pixels', async () => {
    const idat = Buffer.concat([deflateSync(Buffer.alloc(410)), Buffer.from('hidden')]);
    expect(await cleanPng(createPng(10, 10, { idat }))).toEqual(createPng(10, 10));
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
    ['unknown filters', createPng(10, 10, { pixels: Buffer.alloc(410, 5) })],
    ['no pixels', createPng(0, 10)],
    ['an unknown color', createPng(10, 10, { color: 5 })],
    ['no palette', createPng(10, 10, { color: 3 })],
    ['a broken palette', addChunks(createPng(), { type: 'PLTE', content: Buffer.alloc(7) })],
    ['a long transparency', addChunks(createPng(), { type: 'tRNS', content: Buffer.alloc(257) })],
    ['too many pixels', createPng(4000, 4001, { idat: Buffer.alloc(0) })],
    ['16 bits and many pixels', createPng(4000, 4000, { depth: 16, idat: Buffer.alloc(0) })],
    ['only a signature', createPng().slice(0, 8)],
    ['a chunk cut off', createPng().slice(0, 45)],
    ['a second header', addChunks(createPng(), { type: 'IHDR', content: Buffer.alloc(13) })],
  ])('rejects %s', async (_name, file) => {
    expect(await cleanPng(file)).toBeNull();
  });
});
