import { useTranslation } from 'react-i18next';
import { Outlet, redirect } from 'react-router';
import type { Route } from './+types/layout';
import { Logo } from '~/components/Logo';
import { userContext } from '~/context';

export const middleware: Route.MiddlewareFunction[] = [
  ({ context }, next) => {
    if (context.get(userContext)) throw redirect('/home');
    return next();
  },
];

export function loader() {
  return null;
}

/** The rings of the mark, hanging from the ceiling of the panel. */
function Rings() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 400"
      preserveAspectRatio="xMidYMin meet"
      className="absolute inset-x-0 top-0 mx-auto hidden h-[78%] lg:block"
    >
      <g fill="none" strokeLinecap="round">
        <path d="M55 0v232M145 0v232" strokeWidth="5" className="stroke-ink-accent" />
        <path d="M55 214v20M145 214v20" strokeWidth="9" className="stroke-brand" />
        <circle cx="55" cy="274" r="36" strokeWidth="10" className="stroke-brand" />
        <circle cx="145" cy="274" r="36" strokeWidth="10" className="stroke-brand" />
      </g>
    </svg>
  );
}

export default function AuthLayout() {
  const { t } = useTranslation();

  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] lg:grid-cols-2 lg:grid-rows-1">
      <div className="relative flex flex-col justify-end overflow-hidden bg-ink px-4 py-6 text-ink-foreground lg:p-12">
        <Rings />
        <div className="relative mx-auto flex w-full max-w-sm items-center gap-3 lg:mx-0 lg:max-w-none">
          <Logo className="size-11 lg:hidden" />
          <div>
            <p className="font-display text-2xl leading-none lg:text-6xl">{t('appName')}</p>
            <p className="mt-1 text-sm text-ink-muted lg:mt-3 lg:text-lg">{t('tagline')}</p>
          </div>
        </div>
      </div>
      <main
        id="content"
        className="flex items-start justify-center px-4 py-8 sm:items-center lg:bg-card"
      >
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
