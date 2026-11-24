import { ClockIcon, TriangleAlertIcon, TrophyIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Route } from './+types/dashboard';
import { LiveGroundCard } from '~/components/competition/LiveGroundCard';
import { NextSteps } from '~/components/competition/NextSteps';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { StartDialog } from '~/components/divisions/DivisionDialogs';
import { inRunningOrder, type Division } from '~/components/divisions/divisionList';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { Stats, StatTile } from '~/components/StatTile';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { competitionContext } from '~/context';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { getStats } from '~/lib/competitions.server';
import { listDivisions } from '~/lib/divisions.server';
import { getPhase } from '~/lib/domain/competitionPhase';
import { formatDateRange } from '~/lib/format';
import { getLatestGrades, getLiveGrounds, type LatestGrade } from '~/lib/liveResults.server';
import { cn } from '~/lib/utils';

const LATEST_GRADES = 12;

export async function loader({ context }: Route.LoaderArgs) {
  const { id, grounds } = context.get(competitionContext);
  const [stats, liveGrounds, latestGrades, planned, running] = await Promise.all([
    getStats(id),
    getLiveGrounds(id, grounds),
    getLatestGrades(id, LATEST_GRADES),
    listDivisions(id, { state: 'PENDING' }),
    listDivisions(id, { state: 'RUNNING' }),
  ]);
  return { stats, grounds: liveGrounds, latestGrades, planned, running };
}

function LatestGrades({ grades }: { grades: LatestGrade[] }) {
  const { t } = useTranslation(['competition', 'common']);
  return (
    <section aria-labelledby="latest-title">
      <h2 id="latest-title" className="mb-3 font-display text-lg">
        {t('dashboard.latestGrades')}
      </h2>
      <ul className="divide-y rounded-xl border bg-card px-4 py-1">
        {grades.map(({ id, firstname, lastname, clubName, category, apparatus, grade }) => (
          <li key={id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 text-sm leading-snug">
              <p className="truncate font-semibold">{`${firstname} ${lastname}`}</p>
              <p className="truncate text-muted-foreground">
                {category} {t(`common:apparatus.${apparatus}` as 'common:apparatus.reck')},{' '}
                {clubName}
              </p>
            </div>
            <p className="figure shrink-0 text-xl">{grade}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Dashboard({
  loaderData: { stats, grounds, latestGrades, planned: unordered, running },
}: Route.ComponentProps) {
  const { t, i18n } = useTranslation(['competition', 'divisions', 'common']);
  const { competition, contests, canEdit } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const { starters, clubs, grades, divisions } = stats;
  const phase = getPhase(stats);
  const dates = formatDateRange(competition.startDate, competition.endDate, i18n.language);
  const contestBase =
    contests.length > 0 && `/competitions/${competition.id}/contests/${contests[0].id}`;
  const hasGrades = latestGrades.length > 0;
  const planned = inRunningOrder(unordered);
  const incomplete = [...running, ...planned].filter(({ unassignedCount }) => unassignedCount > 0);
  const divisionName = useDivisionName();
  const [starting, setStarting] = useState<Division | null>(null);
  const { Form, pending } = useActionFetcher(() => setStarting(null));
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);

  function divisionsUrl(contestId: string) {
    return `/competitions/${competition.id}/contests/${contestId}/divisions`;
  }

  function divisionUrl({ id, contestId }: { id: string; contestId: string }) {
    return `${divisionsUrl(contestId)}/${id}/lineups`;
  }

  function start(division: Division) {
    opener.current = document.activeElement as HTMLElement | null;
    setStarting(division);
  }

  /** The button disappears when the division was started. */
  function restoreFocus(event: Event) {
    event.preventDefault();
    const target = opener.current;
    // Safari does not focus buttons that are clicked.
    if (target?.isConnected && target !== document.body) target.focus();
    if (document.activeElement !== target) content.current?.focus();
  }

  const groundCards = (
    <div className="grid gap-4">
      {grounds.map((ground) => (
        <LiveGroundCard
          key={ground.ground}
          ground={ground}
          planned={planned.filter((division) => division.ground === ground.ground)}
          divisionUrl={divisionUrl}
          onStart={canEdit ? start : undefined}
        />
      ))}
    </div>
  );

  return (
    <>
      <title>{`${competition.name} · UTEG`}</title>
      <PageHeader
        title={t('common:nav.dashboard')}
        description={`${competition.location}, ${dates}`}
        status={<ConnectionBadge status={status} />}
      />
      <div
        ref={content}
        tabIndex={-1}
        className={cn('grid gap-7 outline-none', !hasGrades && 'max-w-4xl')}
      >
        {canEdit && incomplete.length > 0 && (
          <Alert role="note" variant="warning">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>{t('dashboard.incomplete')}</AlertTitle>
            <AlertDescription>
              <ul>
                {incomplete.map((division) => (
                  <li key={division.id}>
                    <Link
                      to={divisionUrl(division)}
                      className="inline-flex items-center underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
                    >
                      {divisionName(division)}
                    </Link>{' '}
                    ({t('divisions:unassigned', { count: division.unassignedCount })})
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {starters > 0 && (
          <Stats>
            <StatTile label={t('dashboard.starters')} value={starters} />
            <StatTile label={t('dashboard.clubs')} value={clubs} />
            <StatTile
              label={t('dashboard.divisionsEnded')}
              value={`${divisions.ENDED}/${divisions.PENDING + divisions.RUNNING + divisions.ENDED}`}
            />
            <StatTile label={t('dashboard.grades')} value={grades} />
          </Stats>
        )}

        <div
          className={cn(
            'grid grid-cols-1 items-start gap-x-8 gap-y-7',
            hasGrades && 'xl:grid-cols-[minmax(0,1fr)_21rem]',
          )}
        >
          <section aria-labelledby="now-title">
            <h2 id="now-title" className="mb-3 font-display text-lg">
              {t(canEdit ? `dashboard.title.${phase}` : `home.status.${phase}`)}
            </h2>
            {phase === 'running' || phase === 'continue' ? (
              groundCards
            ) : canEdit ? (
              <div className="grid gap-4">
                <NextSteps
                  phase={phase}
                  base={`/competitions/${competition.id}`}
                  contestId={contests[0]?.id}
                />
                {phase === 'start' && groundCards}
              </div>
            ) : phase === 'ended' ? (
              <EmptyState
                icon={TrophyIcon}
                title={t('dashboard.resultsReady')}
                action={
                  contestBase && (
                    <Button asChild>
                      <Link to={`${contestBase}/ranking`}>{t('dashboard.toRanking')}</Link>
                    </Button>
                  )
                }
              />
            ) : (
              <EmptyState
                icon={ClockIcon}
                title={t('dashboard.noRunning')}
                text={t('dashboard.noRunningText')}
              />
            )}
          </section>
          {hasGrades && <LatestGrades grades={latestGrades} />}
        </div>
      </div>
      {starting && (
        <StartDialog
          // As it was sent, or as it is now.
          divisions={pending ? [starting] : planned.filter(({ id }) => id === starting.id)}
          planned={planned.filter(({ contestId }) => contestId === starting.contestId)}
          running={running}
          action={divisionsUrl(starting.contestId)}
          Form={Form}
          pending={pending}
          onSubmit={() => {}}
          onClose={() => setStarting(null)}
          onCloseAutoFocus={restoreFocus}
        />
      )}
    </>
  );
}
