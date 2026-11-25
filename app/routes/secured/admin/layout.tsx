import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import type { Route } from './+types/layout';
import { PageHeader } from '~/components/PageHeader';
import { StatTile, Stats } from '~/components/StatTile';
import { getAdminStats } from '~/lib/admin.server';
import { cn } from '~/lib/utils';
import { adminMiddleware } from '~/middlewares/admin.server';

export const middleware: Route.MiddlewareFunction[] = [adminMiddleware];

// Client navigations only run middleware on the server when a matched route has a loader.
export function loader() {
  return getAdminStats();
}

export default function AdminLayout({ loaderData: stats }: Route.ComponentProps) {
  const { t } = useTranslation('admin');
  const pages = [
    { to: '/admin', label: t('users') },
    { to: '/admin/competitions', label: t('competitions') },
  ];

  return (
    <>
      <PageHeader title={t('title')} />
      <Stats>
        <StatTile
          label={
            stats.unverified > 0
              ? `${t('users')}, ${t('unverifiedCount', { count: stats.unverified })}`
              : t('users')
          }
          value={stats.users}
        />
        <StatTile label={t('competitions')} value={stats.competitions} />
        <StatTile label={t('starters')} value={stats.starters} />
        <StatTile label={t('grades')} value={stats.grades} />
      </Stats>
      <nav aria-label={t('title')} className="mt-7 mb-4 flex gap-2">
        {pages.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              cn(
                'inline-flex h-10 items-center rounded-md border px-4 text-sm font-semibold pointer-coarse:h-11',
                isActive
                  ? 'border-ink bg-ink text-ink-foreground dark:border-primary dark:bg-primary dark:text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
