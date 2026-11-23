import { MAX_COVER_PIXELS } from './cover';

export type Jpeg = { data: Uint8Array<ArrayBuffer>; width: number; height: number };

/** Progressive files have about ten. Every scan of a small file can make viewers work a lot. */
const MAX_SCANS = 32;

/**
 * A JPEG as browsers make them, without metadata and whatever follows the image. Null unless it is
 * complete and plausible. The image data itself is not decoded.
 */
export function cleanJpeg(file: Uint8Array): Jpeg | null {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (file.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  const kept = [file.subarray(0, 2)];
  let frame: { width: number; height: number; progressive: boolean } | null = null;
  let scans = 0;
  let scanBytes = 0;
  const tables = new Set<number>();
  let offset = 2;

  while (offset + 2 <= file.byteLength) {
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

    switch (marker) {
      // Tables of the decoder, and the restart interval.
      case 0xdb:
      case 0xc4:
      case 0xdd:
        tables.add(marker);
        break;
      case 0xc0:
      case 0xc2: {
        if (frame) return null;
        frame = readFrame(view, offset + 4, end, marker === 0xc2);
        if (!frame) return null;
        break;
      }
      case 0xda: {
        if (!frame || !tables.has(0xdb) || !tables.has(0xc4) || ++scans > MAX_SCANS) return null;
        const scanEnd = findScanEnd(file, end);
        scanBytes += scanEnd - end;
        kept.push(file.subarray(offset, scanEnd));
        offset = scanEnd;
        continue;
      }
      default:
        // Applications and comments are left out, others are not for pictures of a browser.
        if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
          offset = end;
          continue;
        }
        return null;
    }
    kept.push(file.subarray(offset, end));
    offset = end;
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFrame(view: DataView, start: number, end: number, progressive: boolean) {
  if (start + 6 > end) return null;
  const [precision, height, width, components] = [
    view.getUint8(start),
    view.getUint16(start + 1),
    view.getUint16(start + 3),
    view.getUint8(start + 5),
  ];
  const isSize = (size: number) => size >= 1 && size <= MAX_COVER_PIXELS;
  if (precision !== 8 || !isSize(width) || !isSize(height)) return null;
  // Grey or colour. Four are CMYK, which browsers don't make.
  if ((components !== 1 && components !== 3) || end !== start + 6 + 3 * components) return null;
  return { width, height, progressive };
}

/** Where the next marker is. In the data 0xff is followed by 0, or restarts. */
function findScanEnd(file: Uint8Array, start: number) {
  for (let offset = start; offset + 1 < file.byteLength; offset++) {
    const next = file[offset + 1];
    if (file[offset] === 0xff && next !== 0 && !(next >= 0xd0 && next <= 0xd7)) return offset;
  }
  return file.byteLength;
}

function isPlausible(
  { width, height, progressive }: { width: number; height: number; progressive: boolean },
  scans: number,
  scanBytes: number,
) {
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
