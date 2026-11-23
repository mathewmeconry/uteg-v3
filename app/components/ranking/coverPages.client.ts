import { COVER_PIXELS, MAX_COVER_PAGE_BYTES, MAX_COVER_PAGES } from '~/lib/domain/cover';
import { createCanvas, detectImageType, drawImage, toBlob } from '~/lib/images.client';

type CoverFileErrorCode =
  'COVER_ENCRYPTED' | 'COVER_TOO_MANY_PAGES' | 'FILE_TOO_LARGE' | 'INVALID_COVER';

/** The code is one of DomainError, so it has a message. */
export class CoverFileError extends Error {
  constructor(readonly code: CoverFileErrorCode) {
    super(code);
  }
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** 200 dots per inch, PDFs have 72 units. */
const PDF_SCALE = 200 / 72;
const QUALITIES = [0.9, 0.75, 0.5];

/**
 * The pages of a PDF, or a picture, as JPEGs that look the same. Drawn in the browser of the user,
 * so that the server only gets pictures and never has to read files of others.
 */
export async function createCoverPages(file: File): Promise<Blob[]> {
  if (file.size > MAX_FILE_BYTES) throw new CoverFileError('FILE_TOO_LARGE');
  // Some PDFs start with something else.
  const start = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
  if (start.includes('%PDF-')) return drawPdf(file);
  if (!(await detectImageType(file))) throw new CoverFileError('INVALID_COVER');
  const canvas = await drawImage(file, COVER_PIXELS, 'white').catch(() => {
    throw new CoverFileError('INVALID_COVER');
  });
  return [await toJpeg(canvas)];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function drawPdf(file: File) {
  const { openPdf } = await import('./openPdf.client');
  const task = openPdf(new Uint8Array(await file.arrayBuffer()));
  try {
    const document = await task.promise;
    if (document.numPages > MAX_COVER_PAGES) throw new CoverFileError('COVER_TOO_MANY_PAGES');
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const { width, height } = page.getViewport({ scale: 1 });
      const scale = Math.min(PDF_SCALE, COVER_PIXELS / Math.max(width, height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      // With what is visible in annotations, such as filled in forms.
      await page.render({ canvas, viewport, background: 'white' }).promise;
      pages.push(await toJpeg(canvas));
    }
    return pages;
  } catch (error) {
    if (error instanceof CoverFileError) throw error;
    const isEncrypted = error instanceof Error && error.name === 'PasswordException';
    throw new CoverFileError(isEncrypted ? 'COVER_ENCRYPTED' : 'INVALID_COVER');
  } finally {
    await task.destroy();
  }
}

async function toJpeg(canvas: HTMLCanvasElement) {
  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, 'image/jpeg', quality);
    if (!blob) throw new CoverFileError('INVALID_COVER');
    if (blob.size <= MAX_COVER_PAGE_BYTES) return blob;
  }
  throw new CoverFileError('FILE_TOO_LARGE');
}
