import { readImageSize } from './imageSize';

const PNG = [
  ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52],
  ...[0, 0, 0x1f, 0x40, 0, 0, 0, 100],
];
const APP0 = [0xff, 0xe0, 0, 4, 1, 2];
const HUFFMAN = [0xff, 0xc4, 0, 3, 0];
const FRAME = [0xff, 0xc2, 0, 11, 8, 0, 50, 0x1f, 0x40, 1, 1, 1, 1];

describe('readImageSize', () => {
  it.each([
    ['PNG', PNG, { width: 8000, height: 100 }],
    ['JPEG', [0xff, 0xd8, ...APP0, ...HUFFMAN, 0xff, ...FRAME], { width: 8000, height: 50 }],
    ['PNG without header', [...PNG.slice(0, 8), ...PNG.map(() => 1)], null],
    ['short PNG', PNG.slice(0, 20), null],
    ['JPEG without frame', [0xff, 0xd8, ...APP0], null],
    ['broken JPEG', [0xff, 0xd8, ...Array.from({ length: 20 }, () => 7)], null],
    ['JPEG with an endless segment', [0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0, 0, 0, 0, 0, 0], null],
    ['nothing', [], null],
  ])('reads %s', (_name, bytes, size) => {
    expect(readImageSize(Uint8Array.from(bytes))).toEqual(size);
  });
});
