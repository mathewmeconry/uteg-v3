import { useContext, useEffect, type ReactNode } from 'react';
import { I18nContext, useTranslation } from 'react-i18next';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from 'react-router';
import type { Route } from './+types/root';
import { ErrorPage } from '~/components/ErrorPage';
import { Toaster } from '~/components/ui/sonner';
import { TooltipProvider } from '~/components/ui/tooltip';
import { languageContext } from '~/context';
import { useToasts } from '~/hooks/useToasts';
import { APP_ORIGIN } from '~/lib/env.server';
import { sessionMiddleware } from '~/middlewares/auth.server';
import { i18nMiddleware } from '~/middlewares/i18n.server';
import { originMiddleware } from '~/middlewares/origin.server';
import { securityHeadersMiddleware } from '~/middlewares/securityHeaders.server';
import { toastMiddleware } from '~/middlewares/toast.server';
import './app.css';

export const middleware: Route.MiddlewareFunction[] = [
  securityHeadersMiddleware,
  sessionMiddleware,
  i18nMiddleware,
  originMiddleware(APP_ORIGIN),
  toastMiddleware,
];

export function loader({ context }: Route.LoaderArgs) {
  return { language: context.get(languageContext) };
}

// Judges and displays stay on one page. A refresh that fails, e.g. offline, must not replace it.
export function shouldRevalidate({
  currentUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return defaultShouldRevalidate && !/^\/(judge|display)\//.test(currentUrl.pathname);
}

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

export const meta: Route.MetaFunction = () => [{ title: 'UTEG' }];

function NavigationProgress() {
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;
  return <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-primary" />;
}

export function Layout({ children }: { children: ReactNode }) {
  const { i18n, t } = useTranslation();
  useToasts();

  return (
    <html lang={i18n.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b1a3c" />
        <Meta />
        <Links />
      </head>
      <body>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {t('skipToContent')}
        </a>
        <TooltipProvider>
          <NavigationProgress />
          {children}
        </TooltipProvider>
        <Toaster position="top-center" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData: { language } }: Route.ComponentProps) {
  // useTranslation returns another i18n after every change, which would undo the language switch of
  // judges and displays.
  const i18n = useContext(I18nContext)?.i18n;

  useEffect(() => {
    if (i18n && i18n.language !== language) void i18n.changeLanguage(language);
  }, [language, i18n]);

  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const detail = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;
  return <ErrorPage status={isRouteErrorResponse(error) ? error.status : 500} detail={detail} />;
}
