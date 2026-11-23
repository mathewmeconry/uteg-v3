/** Width and height in the header of a PNG or JPEG file, null if there is none. */
export function readImageSize(data: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data[0] === 0x89) {
    const hasHeader = data.byteLength >= 24 && view.getUint32(12) === 0x49484452; // IHDR
    return hasHeader ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  }

  // JPEG: segments of a marker and their length, the size is in the first frame header.
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
    if (isFrame) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    // Markers without a length.
    const isBare = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
    offset += isBare ? 2 : 2 + view.getUint16(offset + 2);
  }
  return null;
}
