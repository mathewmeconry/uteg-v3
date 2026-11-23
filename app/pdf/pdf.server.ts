import type { DocumentProps } from '@react-pdf/renderer';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
// Inlined, so the fonts are part of the server bundle.
import { breakWord } from './components';
import bold from './fonts/Roboto-Bold.ttf?inline';
import regular from './fonts/Roboto-Regular.ttf?inline';

export const FONT = 'Roboto';

Font.register({
  family: FONT,
  fonts: [
    { src: regular, fontWeight: 400 },
    { src: bold, fontWeight: 700 },
  ],
});
// Normal text is not hyphenated, only words that could be wider than the page.
Font.registerHyphenationCallback((word) => breakWord(word, 30));

/** Renders a document into a response that is shown in the browser. */
export async function pdfResponse(document: ReactElement<DocumentProps>, name: string) {
  const buffer = await renderToBuffer(document);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(`${name}.pdf`),
      'Cache-Control': 'no-store',
    },
  });
}

export function contentDisposition(filename: string) {
  const safe = filename
    // Control characters, and what is not allowed in file names on Windows.
    .replace(/[\p{Cc}\p{Cf}"*/:<>?\\|]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const umlauts: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' };
  const ascii = safe
    .replace(/[äöüÄÖÜ]/g, (letter) => umlauts[letter])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^ -~]/g, '_');
  const encoded = encodeURIComponent(safe.toWellFormed()).replace(
    /['()]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
