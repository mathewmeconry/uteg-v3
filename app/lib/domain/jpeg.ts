export type Jpeg = { data: Uint8Array<ArrayBuffer>; width: number; height: number };

/** Progressive files have about ten. Every scan of a small file can make viewers work a lot. */
const MAX_SCANS = 32;
/** Browsers make about a dozen. Each costs the libraries that read the file memory. */
const MAX_SEGMENTS = 100;

/**
 * A JPEG as browsers make them, without metadata and whatever follows the image. Null unless it is
 * complete and plausible, and every segment has exactly its length: what is too long would be read
 * as further segments by others. The image data itself is not decoded.
 */
export function cleanJpeg(file: Uint8Array, maxPixels: number): Jpeg | null {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (file.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  const kept = [file.subarray(0, 2)];
  const tables = new Set<number>();
  let frame: Frame | null = null;
  let scans = 0;
  let scanBytes = 0;
  let offset = 2;

  for (let segments = 0; segments < MAX_SEGMENTS && offset + 2 <= file.byteLength; segments++) {
    if (file[offset] !== 0xff) return null;
    const marker = file[offset + 1];
    if (marker === 0xd9) {
      kept.push(file.subarray(offset, offset + 2));
      return frame && isPlausible(frame, scans, scanBytes)
        ? { data: concat(kept), width: frame.width, height: frame.height }
        : null;
    }
    if (offset + 4 > file.byteLength) return null;
    const end = offset + 2 + view.getUint16(offset + 2);
    if (end < offset + 4 || end > file.byteLength) return null;
    const content = file.subarray(offset + 4, end);

    // Applications and comments are left out.
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      offset = end;
      continue;
    }
    let segmentEnd = end;
    switch (marker) {
      case 0xdb:
        if (!isQuantization(content)) return null;
        break;
      case 0xc4:
        if (!isHuffman(content)) return null;
        break;
      // The restart interval.
      case 0xdd:
        if (content.byteLength !== 2) return null;
        break;
      case 0xc0:
      case 0xc2:
        if (frame) return null;
        frame = readFrame(content, marker === 0xc2, maxPixels);
        if (!frame) return null;
        break;
      case 0xda:
        if (!frame || !tables.has(0xdb) || !tables.has(0xc4) || ++scans > MAX_SCANS) return null;
        if (content[0] < 1 || content[0] > frame.components) return null;
        if (content.byteLength !== 4 + 2 * content[0]) return null;
        segmentEnd = findScanEnd(file, end);
        scanBytes += segmentEnd - end;
        break;
      default:
        return null;
    }
    tables.add(marker);
    kept.push(file.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Frame = { width: number; height: number; components: number; progressive: boolean };

function readFrame(content: Uint8Array, progressive: boolean, maxPixels: number): Frame | null {
  const [precision, high, low, wide, narrow, components] = content;
  const [height, width] = [high * 256 + low, wide * 256 + narrow];
  // Grey or colour. Four are CMYK, which browsers don't make.
  if ((components !== 1 && components !== 3) || content.byteLength !== 6 + 3 * components) {
    return null;
  }
  const isSize = (size: number) => size >= 1 && size <= maxPixels;
  if (precision !== 8 || !isSize(width) || !isSize(height)) return null;
  for (let index = 0; index < components; index++) {
    const sampling = content[7 + index * 3];
    const isFactor = (factor: number) => factor >= 1 && factor <= 4;
    if (!isFactor(sampling >> 4) || !isFactor(sampling & 15)) return null;
  }
  return { width, height, components, progressive };
}

/** Tables with their number and 64 values of 8 bits. */
function isQuantization(content: Uint8Array) {
  if (content.byteLength === 0 || content.byteLength % 65 !== 0) return false;
  for (let start = 0; start < content.byteLength; start += 65) if (content[start] > 3) return false;
  return true;
}

/** Tables with their number, how many codes of each of 16 lengths there are, and those codes. */
function isHuffman(content: Uint8Array) {
  let start = 0;
  while (start + 17 <= content.byteLength) {
    if (content[start] >> 4 > 1 || (content[start] & 15) > 3) return false;
    const codes = content.subarray(start + 1, start + 17).reduce((sum, count) => sum + count, 0);
    if (codes > 256) return false;
    start += 17 + codes;
  }
  return start > 0 && start === content.byteLength;
}

/** Where the next marker is. In the data 0xff is followed by 0, or restarts. */
function findScanEnd(file: Uint8Array, start: number) {
  for (let offset = start; offset + 1 < file.byteLength; offset++) {
    const next = file[offset + 1];
    if (file[offset] === 0xff && next !== 0 && !(next >= 0xd0 && next <= 0xd7)) return offset;
  }
  return file.byteLength;
}

function isPlausible({ width, height, progressive }: Frame, scans: number, scanBytes: number) {
  // Baseline files need at least two bits for each block of 8 × 8 pixels.
  const minimum = progressive ? 1 : (Math.ceil(width / 8) * Math.ceil(height / 8) * 2) / 8;
  return scans > 0 && scanBytes >= minimum;
}

function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, { byteLength }) => sum + byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
