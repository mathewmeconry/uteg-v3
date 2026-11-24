import {
  ChevronsUpDownIcon,
  FileTextIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  MenuIcon,
  MonitorIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TabletIcon,
  TrophyIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { AccountMenu } from '~/components/AccountMenu';
import { CompetitionSearch } from '~/components/CompetitionSearch';
import { Logo } from '~/components/Logo';
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
import { useCompetition } from '~/hooks/useCompetition';
import { useUser } from '~/hooks/useUser';
import { formatDateRange } from '~/lib/format';
import { cn } from '~/lib/utils';

type Item = { to: string; label: string; icon: LucideIcon; active: boolean };

/** Only the link of the page itself, not of a page above it, is the current page. */
function ariaCurrent({ to, active }: Pick<Item, 'to' | 'active'>, pathname: string) {
  if (!active) return undefined;
  return pathname.replace(/\/$/, '') === to ? 'page' : 'true';
}

function useNavItems(): { main: Item[]; setup: Item[]; isSetup: boolean } {
  const { t } = useTranslation();
  const { competition, contests, canEdit, isCheckIn } = useCompetition();
  const params = useParams();
  const { pathname } = useLocation();

  const base = `/competitions/${competition.id}`;
  const contest = contests.find(({ id }) => id === params.contestId) ?? contests[0];
  const contestBase = contest && `${base}/contests/${contest.id}`;
  const starters = item(`${base}/starters`, t('nav.starters'), UsersIcon);
  if (isCheckIn) return { main: [starters], setup: [], isSetup: false };

  function item(to: string, label: string, icon: LucideIcon, ...alsoActive: string[]): Item {
    const active = [to, ...alsoActive].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    return { to, label, icon, active };
  }

  const main = [
    {
      ...item(base, t('nav.dashboard'), LayoutDashboardIcon),
      // Every page is below it.
      active: pathname === base || pathname === `${base}/`,
    },
    starters,
    ...(contestBase
      ? [
          item(
            `${contestBase}/divisions`,
            t('nav.divisions'),
            LayersIcon,
            `${contestBase}/grading`,
          ),
          item(`${contestBase}/ranking`, t('nav.ranking'), TrophyIcon),
        ]
      : []),
  ];
  const setup = [
    item(`${base}/settings`, t('nav.settings'), SettingsIcon),
    ...(contestBase
      ? [item(`${contestBase}/settings`, t('nav.contestSettings'), SlidersHorizontalIcon)]
      : []),
    ...(canEdit
      ? [
          item(`${base}/judges`, t('nav.judges'), TabletIcon),
          item(`${base}/displays`, t('nav.displays'), MonitorIcon),
        ]
      : []),
    item(`${base}/templates`, t('nav.templates'), FileTextIcon),
    item(`${base}/members`, t('nav.members'), UserCogIcon),
  ];
  return { main, setup, isSetup: setup.some(({ active }) => active) };
}

/** The competition one works in, and the way to the others. */
function CompetitionSwitcher() {
  const { t, i18n } = useTranslation();
  const { competition, competitions } = useCompetition();
  const others = competitions.filter(({ id }) => id !== competition.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${competition.name}: ${t('nav.switchCompetition')}`}
        className="flex h-12 min-w-0 items-center gap-2.5 rounded-md pr-2 text-left hover:bg-ink-accent max-lg:flex-1 lg:max-w-64 xl:max-w-80"
      >
        <Logo />
        <span className="grid min-w-0 leading-tight">
          <span className="truncate font-display">{competition.name}</span>
          <span className="truncate text-xs text-ink-muted">
            {formatDateRange(competition.startDate, competition.endDate, i18n.language)}
          </span>
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-1rem)]">
        {others.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t('nav.switchCompetition')}
            </DropdownMenuLabel>
            {others.slice(0, 8).map(({ id, name, startDate, endDate }) => (
              <DropdownMenuItem key={id} asChild>
                <Link to={`/competitions/${id}`}>
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

function TopLink({ to, label, active }: Pick<Item, 'to' | 'label' | 'active'>) {
  const { pathname } = useLocation();
  return (
    <Link
      to={to}
      aria-current={ariaCurrent({ to, active }, pathname)}
      className={cn(
        'flex h-10 items-center rounded-md px-3 text-sm font-semibold whitespace-nowrap hover:bg-ink-accent pointer-coarse:h-11',
        active ? 'bg-ink-accent' : 'text-ink-muted hover:text-ink-foreground',
      )}
    >
      {label}
    </Link>
  );
}

/** On phones and upright tablets the links are in `BottomNav`. */
export function TopBar() {
  const { t } = useTranslation();
  const { competition, role, isCheckIn } = useCompetition();
  const { email } = useUser();
  const { main, setup, isSetup } = useNavItems();

  return (
    <header className="sticky top-0 z-10 bg-ink text-ink-foreground dark:border-b">
      <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-2 px-3 md:px-8 lg:gap-4">
        <CompetitionSwitcher />
        <nav aria-label={t('nav.main')} className="hidden gap-1 lg:flex">
          {main.map((item) => (
            <TopLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {!isCheckIn && (
            <>
              <CompetitionSearch pages={[...main, ...setup]} />
              <div className="hidden lg:block">
                <TopLink
                  to={`/competitions/${competition.id}/settings`}
                  label={t('nav.setup')}
                  active={isSetup}
                />
              </div>
            </>
          )}
          <AccountMenu email={email} detail={t(`role.${role}`)} />
        </div>
      </div>
    </header>
  );
}

const TAB =
  'flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 text-xs font-semibold [font-stretch:70%]';

export function BottomNav() {
  const { t } = useTranslation();
  const { main, setup, isSetup } = useNavItems();
  const { isCheckIn } = useCompetition();
  const { pathname } = useLocation();
  // There is nowhere else to go.
  if (isCheckIn) return null;

  function tabColour(active: boolean) {
    return active ? 'text-foreground' : 'text-muted-foreground';
  }

  return (
    <nav
      data-slot="bottom-nav"
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-20 flex h-(--bottom-nav) border-t bg-card *:min-w-0 *:flex-1 lg:hidden"
    >
      {main.map(({ to, label, icon: Icon, active }) => (
        <Link
          key={to}
          to={to}
          aria-current={ariaCurrent({ to, active }, pathname)}
          className={cn(TAB, tabColour(active))}
        >
          <Icon aria-hidden strokeWidth={active ? 2.5 : 2} className="size-5" />
          {label}
        </Link>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-current={isSetup ? 'true' : undefined}
          className={cn(TAB, tabColour(isSetup))}
        >
          <MenuIcon aria-hidden strokeWidth={isSetup ? 2.5 : 2} className="size-5" />
          {t('nav.more')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t('nav.setup')}
          </DropdownMenuLabel>
          {setup.map(({ to, label, icon: Icon, active }) => (
            <DropdownMenuItem key={to} asChild>
              <Link to={to} aria-current={active ? 'page' : undefined}>
                <Icon aria-hidden />
                <span className={cn(active && 'font-semibold')}>{label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

/** The pages of the settings, next to each of them. */
export function SetupNav() {
  const { t } = useTranslation();
  const { setup, isSetup } = useNavItems();
  if (!isSetup) return null;

  return (
    <nav
      aria-label={t('nav.setup')}
      className="sticky top-22 hidden w-52 shrink-0 flex-col gap-0.5 self-start lg:flex"
    >
      <p className="mb-1 px-3 font-display text-lg">{t('nav.setup')}</p>
      {setup.map(({ to, label, icon: Icon, active }) => (
        <Link
          key={to}
          to={to}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm hover:bg-accent pointer-coarse:min-h-11',
            active ? 'bg-accent font-semibold' : 'font-medium',
          )}
        >
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** On the pages that show one contest of several. */
export function ContestSelect() {
  const { t } = useTranslation();
  const { competition, contests } = useCompetition();
  const { contestId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!contestId || contests.length < 2) return null;

  function switchContest(nextId: string) {
    // Stays in the same section. Divisions belong to one contest, so their pages are left.
    const section = pathname.split(`/contests/${contestId}/`)[1]?.split('/')[0] ?? 'divisions';
    void navigate(`/competitions/${competition.id}/contests/${nextId}/${section}`);
  }

  return (
    <div className="mb-4">
      <Select value={contestId} onValueChange={switchContest}>
        <SelectTrigger aria-label={t('nav.contest')} className="w-full bg-card sm:w-72">
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
