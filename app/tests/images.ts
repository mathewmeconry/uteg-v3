import { crc32, deflateSync } from 'node:zlib';

const u16 = (value: number) => [value >> 8, value & 255];

/** The structure of a JPEG, its image data is made up. */
export function createJpeg(width = 200, height = 100, { scanBytes = 100 } = {}) {
  const segment = (marker: number, content: number[]) => [
    0xff,
    marker,
    ...u16(content.length + 2),
    ...content,
  ];
  const components = [1, 2, 3].flatMap((id) => [id, 0x11, 0]);
  const head = [
    ...[0xff, 0xd8],
    ...segment(0xdb, [0, ...Array<number>(64).fill(1)]),
    ...segment(0xc0, [8, ...u16(height), ...u16(width), 3, ...components]),
    ...segment(0xc4, [0, 1, ...Array<number>(15).fill(0), 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
  ];
  const data = Buffer.alloc(scanBytes, 0x55);
  return new Uint8Array(Buffer.concat([Buffer.from(head), data, Buffer.from([0xff, 0xd9])]));
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
