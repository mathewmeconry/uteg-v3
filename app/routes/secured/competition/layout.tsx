import { MenuIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import type { Route } from './+types/layout';
import { AccountMenu } from '~/components/AccountMenu';
import { CompetitionSidebar } from '~/components/CompetitionSidebar';
import { Button } from '~/components/ui/button';
import { SidebarInset, SidebarProvider, useSidebar } from '~/components/ui/sidebar';
import { competitionContext } from '~/context';
import type { Role } from '~/generated/prisma/enums';
import { useUser } from '~/hooks/useUser';
import { getUser } from '~/lib/auth/auth.server';
import { listCompetitions } from '~/lib/competitions.server';
import { hasRole } from '~/lib/roles';
import { competitionMiddleware } from '~/middlewares/competition.server';

export const middleware: Route.MiddlewareFunction[] = [competitionMiddleware];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { contests, role, ...competition } = context.get(competitionContext);
  const competitions = await listCompetitions(getUser(context).id);
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
    // To switch to another one.
    competitions: competitions.map(({ id, name, startDate, endDate }) => ({
      id,
      name,
      startDate,
      endDate,
    })),
    contests: contests.map(({ id, name, module }) => ({ id, name, module })),
    role,
    canEdit: hasRole(role, 'EDITOR'),
    isOwner: role === 'OWNER',
    // Set by components/ui/sidebar.
    sidebarOpen: !request.headers.get('Cookie')?.includes('sidebar_state=false'),
  };
}

/** Without a sidebar, on phones and upright tablets. */
function Header({ name, role }: { name: string; role: Role }) {
  const { t } = useTranslation();
  const { toggleSidebar } = useSidebar();
  const { email } = useUser();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-1 bg-ink px-1.5 text-ink-foreground lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('nav.menu')}
        onClick={toggleSidebar}
        className="hover:bg-ink-accent hover:text-ink-foreground dark:hover:bg-ink-accent"
      >
        <MenuIcon aria-hidden className="size-5" />
      </Button>
      <Link
        to="."
        relative="route"
        className="flex h-11 min-w-0 flex-1 items-center font-display text-lg"
      >
        <span className="truncate">{name}</span>
      </Link>
      <AccountMenu email={email} detail={t(`role.${role}`)} />
    </header>
  );
}

export default function CompetitionLayout({ loaderData }: Route.ComponentProps) {
  return (
    <SidebarProvider defaultOpen={loaderData.sidebarOpen}>
      <CompetitionSidebar />
      <SidebarInset className="min-w-0">
        <Header name={loaderData.competition.name} role={loaderData.role} />
        <div id="content" className="mx-auto w-full max-w-[90rem] px-4 pt-5 pb-12 md:px-8 md:pt-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
