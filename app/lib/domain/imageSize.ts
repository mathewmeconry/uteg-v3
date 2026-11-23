/**
 * Width and height in the header of a PNG or JPEG file, null if there is none. As it is shown:
 * cameras store portrait photos as landscape ones with an orientation.
 */
export function readImageSize(data: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data[0] === 0x89) {
    const hasHeader = data.byteLength >= 24 && view.getUint32(12) === 0x49484452; // IHDR
    return hasHeader ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  }

  // JPEG: segments of a marker and their length, the size is in the first frame header.
  let isTurned = false;
  let offset = 2;
  while (offset + 9 <= data.byteLength) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    if (marker === 0xff) {
      // Padding before a marker.
      offset += 1;
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      const [height, width] = [view.getUint16(offset + 5), view.getUint16(offset + 7)];
      return isTurned ? { width: height, height: width } : { width, height };
    }
    if (marker === 0xe1) isTurned ||= (readOrientation(view, offset + 4) ?? 1) > 4;
    // Markers without a length.
    const isBare = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
    offset += isBare ? 2 : 2 + view.getUint16(offset + 2);
  }
  return null;
}

/** The orientation (1 to 8) in the EXIF segment at `start`. */
function readOrientation(view: DataView, start: number) {
  const tiff = start + 6;
  if (tiff + 8 > view.byteLength || view.getUint32(start) !== 0x45786966) return null; // Exif
  const littleEndian = view.getUint16(tiff) === 0x4949;
  const directory = tiff + view.getUint32(tiff + 4, littleEndian);
  if (directory + 2 > view.byteLength) return null;
  const count = view.getUint16(directory, littleEndian);
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > view.byteLength) return null;
    if (view.getUint16(entry, littleEndian) === 0x0112)
      return view.getUint16(entry + 8, littleEndian);
  }
  return null;
}
