import { Document, Image, Page, renderToBuffer } from '@react-pdf/renderer';
import { PDFDict, PDFDocument, PDFName, PDFStream, type PDFPage } from 'pdf-lib';
import { MAX_COVER_PAGES, type CoverErrorCode } from '~/lib/domain/cover';
import { readImageSize } from '~/lib/domain/imageSize';

/** What the user can do something about. */
export class CoverError extends Error {
  constructor(readonly code: CoverErrorCode) {
    super(code);
  }
}

/** Keys of streams that refer to other files or to data no page needs. */
const STREAM_KEYS = ['F', 'FFilter', 'FDecodeParms', 'Ref', 'OPI', 'AF', 'PieceInfo', 'Metadata'];
const MAX_PAGE_SIZE = 14_400;

/** Turns an uploaded PDF or image into the PDF to store, with nothing but what its pages show. */
export async function createCover(data: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const source = await loadCover(
    mimeType === 'application/pdf' ? data : await createImagePage(data, mimeType),
  );
  const target = await PDFDocument.create();
  try {
    await insertPages(target, source, [0]);
    return await target.save();
  } catch (error) {
    throw toCoverError(error);
  }
}

/** Inserts the cover before the pages of a PDF, which are numbered from 0. */
export async function insertCover(pdf: Uint8Array, cover: Uint8Array, before: readonly number[]) {
  const target = await PDFDocument.load(pdf, { updateMetadata: false });
  await insertPages(target, await loadCover(cover), before);
  return target.save();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadCover(data: Uint8Array) {
  try {
    const cover = await PDFDocument.load(data, {
      updateMetadata: false,
      throwOnInvalidObject: true,
      ignoreEncryption: true,
    });
    if (cover.isEncrypted) throw new CoverError('COVER_ENCRYPTED');
    const count = cover.getPageCount();
    if (count === 0) throw new CoverError('INVALID_COVER');
    if (count > MAX_COVER_PAGES) throw new CoverError('COVER_TOO_MANY_PAGES');
    for (const [, object] of cover.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFStream)) continue;
      for (const key of STREAM_KEYS) object.dict.delete(PDFName.of(key));
    }
    return cover;
  } catch (error) {
    // Some encrypted files cannot even be parsed.
    if (Buffer.from(data).includes('/Encrypt')) throw new CoverError('COVER_ENCRYPTED');
    throw toCoverError(error);
  }
}

function toCoverError(error: unknown) {
  return error instanceof CoverError ? error : new CoverError('INVALID_COVER');
}

/**
 * Only what the pages draw is taken over, as a drawing on new pages. Annotations, forms, scripts,
 * actions and attached files belong to the pages and the document, so they stay behind.
 */
async function insertPages(target: PDFDocument, source: PDFDocument, before: readonly number[]) {
  const pages = [];
  for (const page of source.getPages()) {
    const { x, y, width, height } = page.getCropBox();
    const isSize = (size: number) => size >= 10 && size <= MAX_PAGE_SIZE;
    if (!isSize(width) || !isSize(height)) throw new CoverError('INVALID_COVER');
    const box = { left: x, bottom: y, right: x + width, top: y + height };
    pages.push({
      width,
      height,
      rotation: page.getRotation(),
      drawing: page.node.Contents() ? await target.embedPage(page, box) : null,
    });
  }
  // From the end, so that earlier positions stay the same.
  for (const index of before.toSorted((a, b) => b - a)) {
    for (const { width, height, rotation, drawing } of pages.toReversed()) {
      const page = target.insertPage(index, [width, height]);
      if (drawing) page.drawPage(drawing);
      page.setRotation(rotation);
    }
  }
}

/** A page that the image fills. */
async function createImagePage(data: Uint8Array, mimeType: string) {
  const size = readImageSize(data);
  if (!size) throw new CoverError('INVALID_COVER');
  const pdf = await renderToBuffer(
    <Document>
      <Page size="A4" orientation={size.width > size.height ? 'landscape' : 'portrait'}>
        <Image
          src={{ data: Buffer.from(data), format: mimeType === 'image/png' ? 'png' : 'jpg' }}
          // Absolute, so it cannot be a fraction too high for the page.
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </Page>
    </Document>,
  );
  // react-pdf leaves out images that it cannot read.
  const [page] = (await PDFDocument.load(pdf)).getPages();
  if (!hasImage(page)) throw new CoverError('INVALID_COVER');
  return pdf;
}

function hasImage(page: PDFPage) {
  const images = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  return (images?.keys().length ?? 0) > 0;
}
