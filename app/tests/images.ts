import { crc32, deflateSync } from 'node:zlib';

const u16 = (value: number) => [value >> 8, value & 255];

/** The structure of a JPEG, its image data is made up. `segments` come before the frame. */
export function createJpeg(
  width = 200,
  height = 100,
  {
    frame = 0xc0,
    precision = 8,
    components = 3,
    scans = 1,
    segments = [] as number[],
    /** Too much in the header of the scan. */
    scanHeader = [] as number[],
    trailing = [0xff, 0xd9],
    scanBytes = (Math.ceil(width / 8) * Math.ceil(height / 8)) / 4,
  } = {},
) {
  const segment = (marker: number, content: number[]) => [
    0xff,
    marker,
    ...u16(content.length + 2),
    ...content,
  ];
  const head = [
    ...[0xff, 0xd8],
    ...segments,
    ...segment(0xdb, [0, ...Array<number>(64).fill(1)]),
    ...segment(frame, [
      precision,
      ...u16(height),
      ...u16(width),
      components,
      ...Array.from({ length: components }, (_, index) => [index + 1, 0x11, 0]).flat(),
    ]),
    ...segment(0xc4, [0, 1, ...Array<number>(15).fill(0), 0]),
  ];
  const scan = segment(0xda, [1, 1, 0, 0, 63, 0, ...scanHeader]);
  const data = Buffer.alloc(Math.ceil(scanBytes), 0x55);
  const parts = Array.from({ length: scans }, () => [Buffer.from(scan), data]).flat();
  return new Uint8Array(Buffer.concat([Buffer.from(head), ...parts, Buffer.from(trailing)]));
}

/** A PNG, with the image data or made up ones that fit the header. */
export function createPng(
  width = 10,
  height = 10,
  {
    depth = 8,
    color = 6,
    interlace = 0,
    pixels = undefined as Buffer | undefined,
    idat = undefined as Buffer | undefined,
  } = {},
) {
  const chunk = (type: string, content: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), content]);
    const result = Buffer.alloc(body.length + 8);
    result.writeUInt32BE(content.length, 0);
    body.copy(result, 4);
    result.writeUInt32BE(crc32(body), body.length + 4);
    return result;
  };
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color] ?? 1;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([depth, color, 0, 0, interlace], 8);
  const size = (1 + Math.ceil((width * channels * depth) / 8)) * height;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', idat ?? deflateSync(pixels ?? Buffer.alloc(size, 0))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
