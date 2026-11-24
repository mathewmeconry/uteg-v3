import type { TFunction } from 'i18next';
import deAuth from './de/auth';
import deCommon from './de/common';
import deCompetition from './de/competition';
import deDisplay from './de/display';
import deDivisions from './de/divisions';
import deJudging from './de/judging';
import deMails from './de/mails';
import dePdf from './de/pdf';
import deRanking from './de/ranking';
import deSettings from './de/settings';
import deStarters from './de/starters';
import enAuth from './en/auth';
import enCommon from './en/common';
import enCompetition from './en/competition';
import enDisplay from './en/display';
import enDivisions from './en/divisions';
import enJudging from './en/judging';
import enMails from './en/mails';
import enPdf from './en/pdf';
import enRanking from './en/ranking';
import enSettings from './en/settings';
import enStarters from './en/starters';
import frAuth from './fr/auth';
import frCommon from './fr/common';
import frCompetition from './fr/competition';
import frDisplay from './fr/display';
import frDivisions from './fr/divisions';
import frJudging from './fr/judging';
import frMails from './fr/mails';
import frPdf from './fr/pdf';
import frRanking from './fr/ranking';
import frSettings from './fr/settings';
import frStarters from './fr/starters';

export const LANGUAGES = ['de', 'fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

const de = {
  common: deCommon,
  auth: deAuth,
  competition: deCompetition,
  starters: deStarters,
  divisions: deDivisions,
  judging: deJudging,
  display: deDisplay,
  ranking: deRanking,
  pdf: dePdf,
  settings: deSettings,
  mails: deMails,
};

export type Resources = typeof de;

/** `common` first, so its keys need no prefix. */
export const NAMESPACES = [
  'common',
  'auth',
  'competition',
  'starters',
  'divisions',
  'judging',
  'display',
  'ranking',
  'pdf',
  'settings',
  'mails',
] as const satisfies (keyof Resources)[];

/** t() of loaders and actions, see getT. */
export type ServerT = TFunction<typeof NAMESPACES>;

export const resources = {
  de,
  en: {
    common: enCommon,
    auth: enAuth,
    competition: enCompetition,
    starters: enStarters,
    divisions: enDivisions,
    judging: enJudging,
    display: enDisplay,
    ranking: enRanking,
    pdf: enPdf,
    settings: enSettings,
    mails: enMails,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    competition: frCompetition,
    starters: frStarters,
    divisions: frDivisions,
    judging: frJudging,
    display: frDisplay,
    ranking: frRanking,
    pdf: frPdf,
    settings: frSettings,
    mails: frMails,
  },
} satisfies Record<Language, object>;
