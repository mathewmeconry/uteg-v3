// The legacy build runs in older browsers too.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

// Fonts that PDFs don't have to contain, and decoders of scans.
const files = import.meta.glob<string>(
  ['/node_modules/pdfjs-dist/{standard_fonts,wasm}/*', '!**/LICENSE*', '!**/quickjs*'],
  { query: '?url', import: 'default' },
);

/** pdf.js asks for files by name, but the build gives them other names. */
class BinaryDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const folder = kind === 'wasmUrl' ? 'wasm' : 'standard_fonts';
    const load = files[`/node_modules/pdfjs-dist/${folder}/${filename}`];
    if (!load) throw new Error(`No file ${filename}`);
    const response = await fetch(await load());
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** Scripts in the PDF are never run, pdf.js leaves that to viewers. */
export function openPdf(data: Uint8Array) {
  return getDocument({ data, useWorkerFetch: false, BinaryDataFactory, verbosity: 0 });
}
