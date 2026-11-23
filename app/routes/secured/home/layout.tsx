import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { AccountMenu } from '~/components/AccountMenu';
import { Logo } from '~/components/Logo';
import { useUser } from '~/hooks/useUser';

export default function HomeLayout() {
  const { t } = useTranslation();
  const { email } = useUser();

  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/home" className="flex items-center gap-2 text-lg font-black tracking-tight">
            <Logo />
            {t('appName')}
          </Link>
          <AccountMenu email={email} />
        </div>
      </header>
      <main id="content" className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </>
  );
}
