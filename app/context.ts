import { createContext, type RouterContextProvider } from 'react-router';
import type { i18n } from 'i18next';
import type { User } from '~/lib/auth/auth.server';
import type { getCompetitionForUser } from '~/lib/competitions.server';
import type { getContest } from '~/lib/contests.server';
import type { Language } from '~/locales';

/** The signed-in user, or null. Use getUser() in secured routes. */
export const userContext = createContext<User | null>(null);
/** Set below competitions/:competitionId, with the user's role. */
export const competitionContext =
  createContext<Awaited<ReturnType<typeof getCompetitionForUser>>>();
/** Set below contests/:contestId, with its module bound to the stored config. */
export const contestContext = createContext<Awaited<ReturnType<typeof getContest>>>();
export const languageContext = createContext<Language>('de');
export const i18nContext = createContext<i18n | null>(null);

export type ToastMessage = { type: 'success' | 'info' | 'warning' | 'error'; message: string };
export const toastContext = createContext<ToastMessage[]>([]);

export type Context = Readonly<RouterContextProvider>;
