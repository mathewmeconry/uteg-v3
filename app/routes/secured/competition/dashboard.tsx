import { ClockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/dashboard';
import { LiveGroundCard } from '~/components/competition/LiveGroundCard';
import { NextSteps } from '~/components/competition/NextSteps';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { Stats, StatTile } from '~/components/StatTile';
import { competitionContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { getStats } from '~/lib/competitions.server';
import { getPhase } from '~/lib/domain/competitionPhase';
import { formatDateRange } from '~/lib/format';
import { getLatestGrades, getLiveGrounds, type LatestGrade } from '~/lib/liveResults.server';
import { cn } from '~/lib/utils';

const LATEST_GRADES = 12;

export async function loader({ context }: Route.LoaderArgs) {
  const { id, grounds } = context.get(competitionContext);
  const [stats, liveGrounds, latestGrades] = await Promise.all([
    getStats(id),
    getLiveGrounds(id, grounds),
    getLatestGrades(id, LATEST_GRADES),
  ]);
  return { stats, grounds: liveGrounds, latestGrades };
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
                {category} {t(`common:apparatus.${apparatus}` as 'common:apparatus.reck')}, {clubName}
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
  loaderData: { stats, grounds, latestGrades },
}: Route.ComponentProps) {
  const { t, i18n } = useTranslation(['competition', 'common']);
  const { competition, contests, canEdit } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const { starters, clubs, grades, divisions } = stats;
  const phase = getPhase(stats);
  const dates = formatDateRange(competition.startDate, competition.endDate, i18n.language);
  const hasGrades = latestGrades.length > 0;

  return (
    <>
      <title>{`${competition.name} · UTEG`}</title>
      <PageHeader
        title={t('common:nav.dashboard')}
        description={`${competition.location}, ${dates}`}
        actions={<ConnectionBadge status={status} />}
      />
      <div className={cn('grid gap-7', !hasGrades && 'max-w-4xl')}>
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
              {t(`dashboard.title.${phase}`)}
            </h2>
            {phase === 'running' ? (
              <div className="grid gap-4">
                {grounds.map((ground) => (
                  <LiveGroundCard key={ground.ground} ground={ground} />
                ))}
              </div>
            ) : canEdit ? (
              <NextSteps
                phase={phase}
                base={`/competitions/${competition.id}`}
                contestId={contests[0]?.id}
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
    </>
  );
}
