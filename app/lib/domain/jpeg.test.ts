import { createJpeg } from '~/tests/images';
import { cleanJpeg } from './jpeg';

const EXIF = [0xff, 0xe1, 0, 6, 0x45, 0x76, 0x69, 0x6c];
const COMMENT = [0xff, 0xfe, 0, 6, 0x45, 0x76, 0x69, 0x6c];
const RESTART = [0xff, 0xdd, 0, 4, 0, 1];

const clean = (file: Uint8Array) => cleanJpeg(file, 3000);

/** A segment with its length. */
const segment = (marker: number, content: number[]) => [
  ...[0xff, marker, (content.length + 2) >> 8, (content.length + 2) & 255],
  ...content,
];
const zeros = (count: number) => Array<number>(count).fill(0);

describe('cleanJpeg', () => {
  it.each([
    ['baseline', {}],
    ['progressive', { frame: 0xc2, scans: 10 }],
    ['grey', { components: 1 }],
    ['restarting', { segments: RESTART }],
    ['several tables in a segment', { segments: segment(0xdb, [...zeros(65), 1, ...zeros(64)]) }],
  ])('accepts %s files', (_name, options) => {
    const file = createJpeg(3000, 200, options);
    expect(clean(file)).toEqual({ data: file, width: 3000, height: 200 });
  });

  it('leaves out metadata and what follows the image', () => {
    const file = createJpeg(200, 100, {
      segments: [...EXIF, ...COMMENT],
      trailing: [0xff, 0xd9, 1, 2, 3],
    });
    expect(clean(file)!.data).toEqual(createJpeg(200, 100));
  });

  it.each([
    ['nothing', new Uint8Array()],
    ['another file', new TextEncoder().encode('%PDF-1.7 and more')],
    ['too wide', createJpeg(3001, 100)],
    ['too high', createJpeg(100, 3001)],
    ['empty', createJpeg(0, 100, { scanBytes: 10 })],
    ['CMYK', createJpeg(200, 100, { components: 4 })],
    ['12 bits', createJpeg(200, 100, { precision: 12 })],
    ['lossless', createJpeg(200, 100, { frame: 0xc3 })],
    ['arithmetic', createJpeg(200, 100, { frame: 0xc9 })],
    ['many scans', createJpeg(200, 100, { frame: 0xc2, scans: 33 })],
    ['many segments', createJpeg(200, 100, { segments: Array(100).fill(RESTART).flat() })],
    ['no scan', createJpeg(200, 100, { scans: 0 })],
    ['no end', createJpeg(200, 100, { trailing: [] })],
    ['too little data', createJpeg(3000, 3000, { scanBytes: 1000 })],
    ['an endless segment', createJpeg(200, 100, { segments: [0xff, 0xe1, 0xff, 0xff] })],
    ['an empty segment', createJpeg(200, 100, { segments: [0xff, 0xe1, 0, 0] })],
    ['an unknown segment', createJpeg(200, 100, { segments: [0xff, 0x01, 0, 2] })],
    // What is too long would hide other segments.
    ['a long scan header', createJpeg(200, 100, { scanHeader: EXIF })],
    ['a long restart interval', createJpeg(200, 100, { segments: segment(0xdd, [0, 1, ...EXIF]) })],
    ['a long quantization table', createJpeg(200, 100, { segments: segment(0xdb, zeros(66)) })],
    ['a 16 bit table', createJpeg(200, 100, { segments: segment(0xdb, [0x10, ...zeros(128)]) })],
    ['a long huffman table', createJpeg(200, 100, { segments: segment(0xc4, zeros(20)) })],
    [
      'a huffman table with too many codes',
      createJpeg(200, 100, { segments: segment(0xc4, [0, 255, 255, ...zeros(14 + 510)]) }),
    ],
    [
      'a second frame',
      createJpeg(200, 100, { segments: segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 17, 0]) }),
    ],
  ])('rejects %s', (_name, file) => {
    expect(clean(file)).toBeNull();
  });

  it('never fails, wherever a file ends', () => {
    const file = createJpeg(40, 40, { segments: EXIF });
    for (let length = 0; length < file.length; length++) {
      expect(clean(file.slice(0, length))).toBeNull();
    }
  });
});
