import { readImageSize } from './imageSize';

const PNG = [
  ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52],
  ...[0, 0, 0x1f, 0x40, 0, 0, 0, 100],
];
const APP0 = [0xff, 0xe0, 0, 4, 1, 2];
const HUFFMAN = [0xff, 0xc4, 0, 3, 0];
// Little endian, one entry: orientation 6.
const EXIF = [
  ...[0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0, 0],
  ...[1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0],
];
const FRAME = [0xff, 0xc2, 0, 11, 8, 0, 50, 0x1f, 0x40, 1, 1, 1, 1];

describe('readImageSize', () => {
  it.each([
    ['PNG', PNG, { width: 8000, height: 100 }],
    ['JPEG', [0xff, 0xd8, ...APP0, ...HUFFMAN, 0xff, ...FRAME], { width: 8000, height: 50 }],
    ['turned JPEG', [0xff, 0xd8, ...EXIF, ...FRAME], { width: 50, height: 8000 }],
    ['JPEG with broken EXIF', [0xff, 0xd8, ...EXIF.slice(0, 20)], null],
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
