import { promisify } from 'node:util';
import { inflate } from 'node:zlib';

const inflateAsync = promisify(inflate);

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** 4000 × 4000 pixels with transparency. */
const MAX_BYTES = 4000 * (4000 * 4 + 1);
/** Start and step of the seven passes of interlaced images, by column and row. */
const PASSES = [
  [0, 8, 0, 8],
  [4, 8, 0, 8],
  [0, 4, 4, 8],
  [2, 4, 0, 4],
  [0, 2, 2, 4],
  [1, 2, 0, 2],
  [0, 1, 1, 2],
];

/**
 * Whether the pixels of a PNG take as much memory as its header says. react-pdf decompresses
 * everything there is, and the limits of its worker don't include that memory.
 */
export async function isSafePng(file: Uint8Array) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const chunks: Uint8Array[] = [];
  let expected = 0;

  for (let offset = 8; offset + 12 <= file.byteLength;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...file.subarray(offset + 4, offset + 8));
    const content = file.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (offset > file.byteLength) return false;
    // Only the first chunk is the header, others could say something else.
    if ((type === 'IHDR') !== (expected === 0)) return false;
    if (type === 'IHDR') {
      expected = length === 13 ? getPixelBytes(content) : 0;
      if (expected === 0 || expected > MAX_BYTES) return false;
    }
    if (type === 'IDAT') chunks.push(content);
    if (type === 'IEND') break;
  }

  try {
    const pixels = await inflateAsync(Buffer.concat(chunks), { maxOutputLength: expected });
    return expected > 0 && pixels.byteLength === expected;
  } catch {
    return false;
  }
}

/** With one byte for the filter of every row. 0 for headers that are not valid. */
function getPixelBytes(header: Uint8Array) {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const [width, height] = [view.getUint32(0), view.getUint32(4)];
  const [depth, color, compression, filter, interlace] = header.subarray(8);
  const channels = CHANNELS[color];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || compression || filter || interlace > 1) {
    return 0;
  }
  const bytes = (columns: number, rows: number) =>
    columns > 0 && rows > 0 ? (1 + Math.ceil((columns * channels * depth) / 8)) * rows : 0;
  if (!interlace) return bytes(width, height);
  return PASSES.reduce(
    (sum, [x, stepX, y, stepY]) =>
      sum + bytes(Math.ceil((width - x) / stepX), Math.ceil((height - y) / stepY)),
    0,
  );
}
