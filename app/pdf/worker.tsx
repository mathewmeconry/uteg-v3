import { parentPort, workerData } from 'node:worker_threads';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { createI18n } from '~/lib/i18n';
import { NAMESPACES, type Language } from '~/locales';
import type { CoverErrorCode } from '~/lib/domain/cover';
import { breakWord, FONT } from './components';
import { CoverError, createCover, insertCover } from './cover';
import { JudgingManualDocument } from './JudgingManualDocument';
import { JudgingSheetsDocument } from './JudgingSheetsDocument';
import { RankingDocument } from './RankingDocument';
import { StartersDocument } from './StartersDocument';

const documents = {
  ranking: RankingDocument,
  judgingSheets: JudgingSheetsDocument,
  starters: StartersDocument,
  judgingManual: JudgingManualDocument,
};

type Documents = typeof documents;

/** What to render. The worker adds `t`, functions cannot be sent to it. */
type DocumentJob = {
  [Type in keyof Documents]: {
    type: Type;
    language: Language;
    props: Omit<Parameters<Documents[Type]>[0], 't' | 'language' | 'onStart'>;
    /** For rankings, a stored cover. */
    cover?: Uint8Array | null;
  };
}[keyof Documents];

/** An uploaded cover to turn into the PDF that is stored. */
type CoverJob = { type: 'cover'; data: Uint8Array; mimeType: string };

export type PdfJob = DocumentJob | CoverJob;

export type PdfResult =
  { pdf: Uint8Array; coverFailed?: boolean } | { coverError: CoverErrorCode } | { error: string };

// Passed in, because only the app's build inlines them.
const { regular, bold } = workerData as { regular: string; bold: string };
Font.register({
  family: FONT,
  fonts: [
    { src: regular, fontWeight: 400 },
    { src: bold, fontWeight: 700 },
  ],
});
// Normal text only breaks words that could be wider than the page.
Font.registerHyphenationCallback((word) => breakWord(word, 30));

async function run(job: PdfJob): Promise<PdfResult> {
  try {
    if (job.type === 'cover') return { pdf: await createCover(job.data, job.mimeType) };
    return await render(job);
  } catch (error) {
    return error instanceof CoverError ? { coverError: error.code } : { error: String(error) };
  }
}

async function render({ type, language, props, cover }: DocumentJob): Promise<PdfResult> {
  const t = createI18n(language).getFixedT(null, NAMESPACES);
  const Document = documents[type] as React.FC<Record<string, unknown>>;
  // The first page of each part, react-pdf calls it more than once.
  const starts = new Map<number, number>();
  const pdf = await renderToBuffer(
    <Document
      {...props}
      t={t}
      language={language}
      onStart={(part: number, page: number) => starts.set(part, page - 1)}
    />,
  );
  if (!cover || !('options' in props)) return { pdf };
  try {
    const before = props.options.cover === 'eachCategory' ? [...starts.values()] : [0];
    return { pdf: await insertCover(pdf, cover, before) };
  } catch {
    // The ranking is more important.
    return { pdf, coverFailed: true };
  }
}

parentPort!.on('message', async (job: PdfJob) => parentPort!.postMessage(await run(job)));
