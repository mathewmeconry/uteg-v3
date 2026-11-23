import type { ServerT } from '~/locales';
import { PdfUnavailableError, renderPdf } from './render.server';
import type { PdfJob } from './worker';

/** Renders a document into a response that is shown in the browser. */
export async function pdfResponse(
  job: PdfJob,
  { name, signal, t }: { name: string; signal: AbortSignal; t: ServerT },
) {
  try {
    const pdf = await renderPdf(job, { signal });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(`${name}.pdf`),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (!(error instanceof PdfUnavailableError)) throw error;
    return new Response(t('pdf:unavailable'), {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
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
