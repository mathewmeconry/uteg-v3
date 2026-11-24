import { useTranslation } from 'react-i18next';
import { Outlet, redirect } from 'react-router';
import type { Route } from './+types/layout';
import { Logo } from '~/components/Logo';
import { Rings } from '~/components/Rings';
import { userContext } from '~/context';

export const middleware: Route.MiddlewareFunction[] = [
  ({ request, context }, next) => {
    // Who forgot the password may still be signed in.
    const { pathname } = new URL(request.url);
    if (context.get(userContext) && !pathname.startsWith('/reset-password')) {
      throw redirect('/home');
    }
    return next();
  },
];

export function loader() {
  return null;
}

export default function AuthLayout() {
  const { t } = useTranslation();

  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] lg:grid-cols-2 lg:grid-rows-1">
      <div className="relative flex flex-col justify-end overflow-hidden bg-ink px-4 py-6 text-ink-foreground lg:p-12">
        <Rings className="absolute inset-x-0 top-0 mx-auto hidden h-[62%] lg:block" />
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
