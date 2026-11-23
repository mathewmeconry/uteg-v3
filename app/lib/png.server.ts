import { promisify } from 'node:util';
import { crc32, inflate } from 'node:zlib';

const inflateAsync = promisify(inflate);

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

/** Rows of pixels, with one byte for the filter each. */
type Pass = { rows: number; rowBytes: number };

/**
 * A PNG with nothing but its picture. Null unless the pixels take as much memory as its header
 * says: react-pdf decompresses everything there is, and the limits of its process don't include
 * that memory.
 */
export async function cleanPng(file: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const pixelData: Uint8Array[] = [];
  let header: Uint8Array | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;

  for (let offset = SIGNATURE.byteLength; offset + 12 <= file.byteLength;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...file.subarray(offset + 4, offset + 8));
    const content = file.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (offset > file.byteLength) return null;
    // The header is first and only there once.
    if ((type === 'IHDR') !== (header === undefined)) return null;
    if (type === 'IHDR') header = content;
    if (type === 'PLTE') palette = content;
    if (type === 'tRNS') transparency = content;
    if (type === 'IDAT') pixelData.push(content);
    if (type === 'IEND') break;
  }

  if (!header || header.byteLength !== 13) return null;
  if (palette && (palette.byteLength > 768 || palette.byteLength % 3 !== 0)) return null;
  if (transparency && transparency.byteLength > 256) return null;
  if (header[9] === 3 && !palette) return null;
  const passes = getPasses(header);
  const bytes = passes.reduce((sum, { rows, rowBytes }) => sum + rows * rowBytes, 0);
  if (bytes === 0 || bytes > MAX_BYTES) return null;

  const compressed = Buffer.concat(pixelData);
  const pixels = await inflateAsync(compressed, { maxOutputLength: bytes }).catch(() => null);
  if (pixels?.byteLength !== bytes || !hasValidFilters(pixels, passes)) return null;

  return new Uint8Array(
    Buffer.concat([
      SIGNATURE,
      createChunk('IHDR', header),
      ...(palette ? [createChunk('PLTE', palette)] : []),
      ...(transparency ? [createChunk('tRNS', transparency)] : []),
      createChunk('IDAT', compressed),
      createChunk('IEND', new Uint8Array()),
    ]),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** None for headers that are not valid. */
function getPasses(header: Uint8Array): Pass[] {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const [width, height] = [view.getUint32(0), view.getUint32(4)];
  const [depth, color, compression, filter, interlace] = header.subarray(8);
  const channels = CHANNELS[color];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || compression || filter || interlace > 1) {
    return [];
  }
  const sizes = interlace
    ? PASSES.map(([x, stepX, y, stepY]) => [
        Math.ceil((width - x) / stepX),
        Math.ceil((height - y) / stepY),
      ])
    : [[width, height]];
  return sizes
    .filter(([columns, rows]) => columns > 0 && rows > 0)
    .map(([columns, rows]) => ({
      rows,
      rowBytes: 1 + Math.ceil((columns * channels * depth) / 8),
    }));
}

function hasValidFilters(pixels: Uint8Array, passes: Pass[]) {
  let offset = 0;
  for (const { rows, rowBytes } of passes) {
    for (let row = 0; row < rows; row++, offset += rowBytes) if (pixels[offset] > 4) return false;
  }
  return true;
}

function createChunk(type: string, content: Uint8Array) {
  const chunk = Buffer.alloc(content.byteLength + 12);
  chunk.writeUInt32BE(content.byteLength, 0);
  chunk.write(type, 4, 'latin1');
  chunk.set(content, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), content.byteLength + 8);
  return chunk;
}
