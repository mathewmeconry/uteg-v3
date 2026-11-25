import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { AccountMenu } from '~/components/AccountMenu';
import { Logo } from '~/components/Logo';

export default function HomeLayout() {
  const { t } = useTranslation();

  return (
    <>
      <header className="sticky top-0 z-10 bg-ink text-ink-foreground">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between pr-2 pl-4 lg:px-6">
          <Link to="/home" className="flex h-11 items-center gap-2 font-display text-xl">
            <Logo />
            {t('appName')}
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main id="content" className="mx-auto max-w-5xl px-4 pt-6 pb-16 md:pt-10 lg:px-6">
        <Outlet />
      </main>
    </>
  );
}
