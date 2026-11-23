import { MenuIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import type { Route } from './+types/layout';
import { AccountMenu } from '~/components/AccountMenu';
import { CompetitionSidebar } from '~/components/CompetitionSidebar';
import { Button } from '~/components/ui/button';
import { SidebarInset, SidebarProvider, useSidebar } from '~/components/ui/sidebar';
import { competitionContext } from '~/context';
import { useUser } from '~/hooks/useUser';
import { hasRole } from '~/lib/roles';
import { competitionMiddleware } from '~/middlewares/competition.server';

export const middleware: Route.MiddlewareFunction[] = [competitionMiddleware];

export function loader({ request, context }: Route.LoaderArgs) {
  const { contests, role, ...competition } = context.get(competitionContext);
  return {
    competition: {
      id: competition.id,
      name: competition.name,
      location: competition.location,
      startDate: competition.startDate,
      endDate: competition.endDate,
      grounds: competition.grounds,
      logoId: competition.logoId,
    },
    contests: contests.map(({ id, name, module }) => ({ id, name, module })),
    role,
    canEdit: hasRole(role, 'EDITOR'),
    isOwner: role === 'OWNER',
    // Set by components/ui/sidebar.
    sidebarOpen: !request.headers.get('Cookie')?.includes('sidebar_state=false'),
  };
}

function Header({ name }: { name: string }) {
  const { t } = useTranslation();
  const { toggleSidebar } = useSidebar();
  const { email } = useUser();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-2">
      <Button variant="ghost" size="icon" aria-label={t('nav.menu')} onClick={toggleSidebar}>
        <MenuIcon aria-hidden className="size-5" />
      </Button>
      <Link to="." relative="route" className="min-w-0 flex-1 truncate font-semibold">
        {name}
      </Link>
      <AccountMenu email={email} />
    </header>
  );
}

export default function CompetitionLayout({ loaderData }: Route.ComponentProps) {
  return (
    <SidebarProvider defaultOpen={loaderData.sidebarOpen}>
      <CompetitionSidebar />
      <SidebarInset className="min-w-0">
        <Header name={loaderData.competition.name} />
        <div id="content" className="p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
