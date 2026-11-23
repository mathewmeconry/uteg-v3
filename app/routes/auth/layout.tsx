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

export default function AuthLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-sidebar p-4">
      <div className="flex items-center gap-3 text-sidebar-foreground">
        <Logo className="size-12" />
        <div>
          <p className="text-2xl font-black tracking-tight">{t('appName')}</p>
          <p className="text-sm">{t('tagline')}</p>
        </div>
      </div>
      <main id="content" className="w-full max-w-sm">
        <Outlet />
      </main>
    </div>
  );
}
