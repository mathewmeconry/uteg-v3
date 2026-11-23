import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type PdfItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  bold: boolean;
};

/** Text, position and colours of each page. */
export async function readPdf(source: Response | Uint8Array) {
  const data = source instanceof Response ? new Uint8Array(await source.arrayBuffer()) : source;
  const document = await getDocument({ data, verbosity: 0, fontExtraProperties: true }).promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const operators = await page.getOperatorList();
    const { items } = await page.getTextContent();
    const { width, height } = page.getViewport({ scale: 1 });
    const texts: PdfItem[] = items.flatMap((item) => {
      if (!('str' in item) || item.str.trim() === '') return [];
      const { name } = page.commonObjs.get(item.fontName) as { name: string };
      return {
        text: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        width: item.width,
        size: item.height,
        bold: /bold/i.test(name),
      };
    });
    pages.push({
      width,
      height,
      items: texts,
      text: texts.map(({ text }) => text).join(' '),
      images: operators.fnArray.filter((operator) => operator === OPS.paintImageXObject).length,
      links: (await page.getAnnotations()).flatMap(({ unsafeUrl }) => unsafeUrl ?? []),
      imageX: findImageX(operators),
      colors: operators.fnArray.flatMap((operator, index) =>
        operator === OPS.setFillRGBColor || operator === OPS.setStrokeRGBColor
          ? [String(operators.argsArray[index][0]).toLowerCase()]
          : [],
      ),
    });
  }
  return pages;
}

/** The left edge of the first image, following the transforms that apply to it. */
function findImageX({ fnArray, argsArray }: { fnArray: number[]; argsArray: any[] }) {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  for (const [index, operator] of fnArray.entries()) {
    if (operator === OPS.save) stack.push(matrix);
    if (operator === OPS.restore) matrix = stack.pop() ?? matrix;
    if (operator === OPS.transform) matrix = Util.transform(matrix, argsArray[index]);
    if (operator === OPS.paintImageXObject) return matrix[4];
  }
  return null;
}

/** A PDF to upload with a page per text. */
export async function createCoverPdf(
  texts: string[],
  change: (document: PDFDocument) => unknown = () => {},
) {
  const document = await PDFDocument.create();
  for (const text of texts) document.addPage([595, 842]).drawText(text, { x: 50, y: 400 });
  await change(document);
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

/** A red PNG. */
export function createPng(width: number, height: number) {
  const chunk = (type: string, content: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), content]);
    const result = Buffer.alloc(body.length + 8);
    result.writeUInt32BE(content.length, 0);
    body.copy(result, 4);
    result.writeUInt32BE(crc32(body), body.length + 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3)]);
  for (let x = 0; x < width; x++) row[1 + x * 3] = 255;
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

/** Pairs of texts that cover each other. */
export function findOverlaps(items: PdfItem[]) {
  const overlaps: string[] = [];
  for (const [index, a] of items.entries()) {
    for (const b of items.slice(index + 1)) {
      const sameLine = Math.abs(a.y - b.y) < Math.min(a.size, b.size) * 0.6;
      const tolerance = 0.5;
      if (sameLine && a.x + a.width > b.x + tolerance && b.x + b.width > a.x + tolerance) {
        overlaps.push(`${a.text} / ${b.text}`);
      }
    }
  }
  return overlaps;
}
