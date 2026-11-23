import { createJpeg } from '~/tests/images';
import { cleanJpeg } from './jpeg';

const EXIF = [0xff, 0xe1, 0, 6, 0x45, 0x76, 0x69, 0x6c];
const COMMENT = [0xff, 0xfe, 0, 6, 0x45, 0x76, 0x69, 0x6c];

describe('cleanJpeg', () => {
  it.each([
    ['baseline', {}],
    ['progressive', { frame: 0xc2, scans: 10 }],
    ['grey', { components: 1 }],
  ])('accepts %s files', (_name, options) => {
    const file = createJpeg(3000, 200, options);
    expect(cleanJpeg(file)).toEqual({ data: file, width: 3000, height: 200 });
  });

  it('leaves out metadata and what follows the image', () => {
    const file = createJpeg(200, 100, {
      segments: [...EXIF, ...COMMENT],
      trailing: [0xff, 0xd9, 1, 2, 3],
    });
    expect(cleanJpeg(file)!.data).toEqual(createJpeg(200, 100));
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
    ['no scan', createJpeg(200, 100, { scans: 0 })],
    ['no end', createJpeg(200, 100, { trailing: [] })],
    ['too little data', createJpeg(3000, 3000, { scanBytes: 1000 })],
    ['an endless segment', createJpeg(200, 100, { segments: [0xff, 0xe1, 0xff, 0xff] })],
    ['an empty segment', createJpeg(200, 100, { segments: [0xff, 0xe1, 0, 0] })],
    ['an unknown segment', createJpeg(200, 100, { segments: [0xff, 0x01, 0, 2] })],
    [
      'a second frame',
      createJpeg(200, 100, { segments: [0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0] }),
    ],
  ])('rejects %s', (_name, file) => {
    expect(cleanJpeg(file)).toBeNull();
  });

  it('never fails, wherever a file ends', () => {
    const file = createJpeg(40, 40, { segments: EXIF });
    for (let length = 0; length < file.length; length++) {
      expect(cleanJpeg(file.slice(0, length))).toBeNull();
    }
  });
});
