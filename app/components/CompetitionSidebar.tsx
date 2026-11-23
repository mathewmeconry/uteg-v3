import {
  ArrowLeftIcon,
  ClipboardPenIcon,
  FileTextIcon,
  GavelIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MonitorIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TrophyIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router';
import { Logo } from '~/components/Logo';
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
            className="h-10 data-[active=true]:text-sidebar-primary"
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

export function CompetitionSidebar() {
  const { t } = useTranslation();
  const { competition, contests, role } = useCompetition();
  const params = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const base = `/competitions/${competition.id}`;
  const contest = contests.find(({ id }) => id === params.contestId) ?? contests[0];
  const contestBase = contest && `${base}/contests/${contest.id}`;

  function switchContest(contestId: string) {
    // Stays in the same section. Divisions belong to one contest, so their pages are left.
    const section = params.contestId
      ? (pathname.split(`/contests/${params.contestId}/`)[1]?.split('/')[0] ?? 'divisions')
      : 'divisions';
    void navigate(`${base}/contests/${contestId}/${section}`);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/home" className="flex items-center gap-2 overflow-hidden p-1">
          <Logo className="size-7" />
          <span className="truncate font-bold group-data-[collapsible=icon]:hidden">
            {competition.name}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Items
              items={[
                { to: base, label: t('nav.dashboard'), icon: LayoutDashboardIcon, end: true },
                { to: `${base}/starters`, label: t('nav.starters'), icon: UsersIcon },
              ]}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        {contestBase && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('nav.groupContest')}</SidebarGroupLabel>
            <SidebarGroupContent>
              {contests.length > 1 && (
                <div className="p-1 group-data-[collapsible=icon]:hidden">
                  <Select value={contest.id} onValueChange={switchContest}>
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
              )}
              <Items
                items={[
                  { to: `${contestBase}/divisions`, label: t('nav.divisions'), icon: LayersIcon },
                  { to: `${contestBase}/grading`, label: t('nav.grading'), icon: ClipboardPenIcon },
                  { to: `${contestBase}/ranking`, label: t('nav.ranking'), icon: TrophyIcon },
                  {
                    to: `${contestBase}/settings`,
                    label: t('nav.contestSettings'),
                    icon: SlidersHorizontalIcon,
                  },
                ]}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.groupAccess')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <Items
              items={[
                { to: `${base}/judges`, label: t('nav.judges'), icon: GavelIcon },
                { to: `${base}/displays`, label: t('nav.displays'), icon: MonitorIcon },
              ]}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.groupAdmin')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <Items
              items={[
                { to: `${base}/templates`, label: t('nav.templates'), icon: FileTextIcon },
                { to: `${base}/members`, label: t('nav.members'), icon: UserCogIcon },
                { to: `${base}/settings`, label: t('nav.settings'), icon: SettingsIcon },
              ]}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="truncate px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          {t(`role.${role}`)}
        </p>
        <Items items={[{ to: '/home', label: t('nav.home'), icon: ArrowLeftIcon }]} />
      </SidebarFooter>
    </Sidebar>
  );
}
