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

/** The fonts come first, because only the app's build inlines them. */
export type PdfMessage = { fonts: { regular: string; bold: string } } | { job: PdfJob };

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

process.on('message', async (message: PdfMessage) => {
  if ('job' in message) return process.send!(await render(message.job));
  Font.register({
    family: FONT,
    fonts: [
      { src: message.fonts.regular, fontWeight: 400 },
      { src: message.fonts.bold, fontWeight: 700 },
    ],
  });
});
// The server is gone.
process.on('disconnect', () => process.exit());
