import { readImageSize } from './imageSize';

export type CoverImage = { data: Uint8Array<ArrayBuffer>; width: number; height: number };

export const MAX_COVER_PAGES = 4;
export const MAX_COVER_PAGE_BYTES = 2 * 1024 * 1024;
/** The long side of the pages the browser makes. */
export const COVER_PIXELS = 2500;
/** The long side the server accepts. */
const MAX_COVER_PIXELS = 3000;

/** A page with its size. Null if it is no JPEG, cut off or too large. */
export function readCoverPage(file: Uint8Array): CoverImage | null {
  const data = new Uint8Array(file);
  const isComplete =
    data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9;
  const size = isComplete ? readImageSize(data) : null;
  return size && Math.max(size.width, size.height) <= MAX_COVER_PIXELS ? { data, ...size } : null;
}
