import {
  ChevronsUpDownIcon,
  ClipboardPenIcon,
  FileTextIcon,
  GavelIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  MonitorIcon,
  PanelLeftIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TrophyIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router';
import { AccountMenu } from '~/components/AccountMenu';
import { Logo } from '~/components/Logo';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/components/ui/sidebar';
import { useCompetition } from '~/hooks/useCompetition';
import { useUser } from '~/hooks/useUser';
import { formatDateRange } from '~/lib/format';
import { cn } from '~/lib/utils';

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean };

function Items({ items }: { items: Item[] }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {items.map(({ to, label, icon: Icon, end }) => (
        <SidebarMenuItem key={to}>
          <SidebarMenuButton
            asChild
            isActive={end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)}
            tooltip={label}
            className="h-9 gap-2.5 font-medium data-[active=true]:font-semibold [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-sidebar-primary"
          >
            <NavLink to={to} end={end} onClick={() => setOpenMobile(false)}>
              <Icon aria-hidden />
              <span>{label}</span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function Group({ label, items }: { label?: string; items: Item[] }) {
  return (
    <SidebarGroup className="py-1.5">
      {label && <SidebarGroupLabel className="h-7 font-semibold">{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <Items items={items} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** The competition one works in, and the way to the others. */
function CompetitionSwitcher() {
  const { t, i18n } = useTranslation();
  const { competition, competitions } = useCompetition();
  const { setOpenMobile } = useSidebar();
  const others = competitions.filter(({ id }) => id !== competition.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          aria-label={`${competition.name}: ${t('nav.switchCompetition')}`}
          className="h-auto min-h-14 gap-3 bg-ink p-2.5 text-ink-foreground group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:bg-transparent hover:bg-ink-accent hover:text-ink-foreground active:bg-ink-accent active:text-ink-foreground data-[state=open]:hover:bg-ink-accent data-[state=open]:hover:text-ink-foreground [&>svg]:size-4 [&>svg:first-child]:size-8"
        >
          <Logo />
          <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
            <span className="line-clamp-2 font-display text-[0.9375rem] leading-tight">
              {competition.name}
            </span>
            <span className="truncate text-xs text-ink-muted">
              {formatDateRange(competition.startDate, competition.endDate, i18n.language)}
            </span>
          </span>
          <ChevronsUpDownIcon aria-hidden className="ml-auto text-ink-muted" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-1rem)]">
        {others.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t('nav.switchCompetition')}
            </DropdownMenuLabel>
            {others.slice(0, 8).map(({ id, name, startDate, endDate }) => (
              <DropdownMenuItem key={id} asChild>
                <Link to={`/competitions/${id}`} onClick={() => setOpenMobile(false)}>
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatDateRange(startDate, endDate, i18n.language)}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link to="/home">
            <LayoutGridIcon aria-hidden />
            {t('nav.allCompetitions')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContestSelect({ contestId }: { contestId: string }) {
  const { t } = useTranslation();
  const { competition, contests } = useCompetition();
  const params = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  function switchContest(nextId: string) {
    // Stays in the same section. Divisions belong to one contest, so their pages are left.
    const section = params.contestId
      ? (pathname.split(`/contests/${params.contestId}/`)[1]?.split('/')[0] ?? 'divisions')
      : 'divisions';
    void navigate(`/competitions/${competition.id}/contests/${nextId}/${section}`);
  }

  return (
    <div className="px-2 pt-1 group-data-[collapsible=icon]:hidden">
      <Select value={contestId} onValueChange={switchContest}>
        <SelectTrigger aria-label={t('nav.contest')} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {contests.map(({ id, name }) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** In the order in which a competition is worked through. */
export function CompetitionSidebar() {
  const { t } = useTranslation();
  const { competition, contests, role, canEdit } = useCompetition();
  const { email } = useUser();
  const { isMobile, state, toggleSidebar } = useSidebar();
  const params = useParams();

  const base = `/competitions/${competition.id}`;
  const contest = contests.find(({ id }) => id === params.contestId) ?? contests[0];
  const contestBase = contest && `${base}/contests/${contest.id}`;
  const inContest = (items: Item[]) => (contestBase ? items : []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <CompetitionSwitcher />
      </SidebarHeader>
      <SidebarContent className="gap-0 pb-4">
        {contest && contests.length > 1 && <ContestSelect contestId={contest.id} />}
        <Group
          items={[{ to: base, label: t('nav.dashboard'), icon: LayoutDashboardIcon, end: true }]}
        />
        <Group
          label={t('nav.groupPrepare')}
          items={[
            { to: `${base}/starters`, label: t('nav.starters'), icon: UsersIcon },
            ...inContest([
              { to: `${contestBase}/divisions`, label: t('nav.divisions'), icon: LayersIcon },
              {
                to: `${contestBase}/settings`,
                label: t('nav.contestSettings'),
                icon: SlidersHorizontalIcon,
              },
            ]),
          ]}
        />
        <Group
          label={t('nav.groupRun')}
          items={[
            ...inContest([
              { to: `${contestBase}/grading`, label: t('nav.grading'), icon: ClipboardPenIcon },
            ]),
            ...(canEdit
              ? [
                  { to: `${base}/judges`, label: t('nav.judges'), icon: GavelIcon },
                  { to: `${base}/displays`, label: t('nav.displays'), icon: MonitorIcon },
                ]
              : []),
          ]}
        />
        <Group
          label={t('nav.groupEvaluate')}
          items={[
            ...inContest([
              { to: `${contestBase}/ranking`, label: t('nav.ranking'), icon: TrophyIcon },
            ]),
            { to: `${base}/templates`, label: t('nav.templates'), icon: FileTextIcon },
          ]}
        />
        <Group
          label={t('nav.groupAdmin')}
          items={[
            { to: `${base}/members`, label: t('nav.members'), icon: UserCogIcon },
            { to: `${base}/settings`, label: t('nav.settings'), icon: SettingsIcon },
          ]}
        />
      </SidebarContent>
      {/* The drawer opens over a bar that has the account. */}
      {!isMobile && (
        <SidebarFooter
          className={cn(
            'flex-row items-center gap-1 border-t border-sidebar-border',
            state === 'collapsed' && 'flex-col',
          )}
        >
          <div className="min-w-0 flex-1">
            <AccountMenu variant="row" email={email} detail={t(`role.${role}`)} />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(state === 'expanded' ? 'nav.collapse' : 'nav.expand')}
            onClick={toggleSidebar}
          >
            <PanelLeftIcon aria-hidden className="text-muted-foreground" />
          </Button>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
