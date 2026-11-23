import { parentPort, workerData } from 'node:worker_threads';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { createI18n } from '~/lib/i18n';
import { NAMESPACES, type Language } from '~/locales';
import { breakWord, FONT } from './components';
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
export type PdfJob = {
  [Type in keyof Documents]: {
    type: Type;
    language: Language;
    props: Omit<Parameters<Documents[Type]>[0], 't' | 'language'>;
  };
}[keyof Documents];

export type PdfResult = { pdf: Uint8Array } | { error: string };

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

async function render({ type, language, props }: PdfJob): Promise<PdfResult> {
  try {
    const t = createI18n(language).getFixedT(null, NAMESPACES);
    const Document = documents[type] as React.FC<Record<string, unknown>>;
    return { pdf: await renderToBuffer(<Document {...props} t={t} language={language} />) };
  } catch (error) {
    return { error: String(error) };
  }
}

parentPort!.on('message', async (job: PdfJob) => parentPort!.postMessage(await render(job)));
