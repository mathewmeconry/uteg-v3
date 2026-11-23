import { ClockIcon, UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Route } from './+types/dashboard';
import { LiveGroundCard } from '~/components/competition/LiveGroundCard';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { competitionContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { getStats } from '~/lib/competitions.server';
import { formatDateRange } from '~/lib/format';
import { getLatestGrades, getLiveGrounds, type LatestGrade } from '~/lib/liveResults.server';

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

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-bold tabular-nums">{value}</dd>
      {detail && <dd className="mt-1 text-sm text-muted-foreground">{detail}</dd>}
    </div>
  );
}

function LatestGrades({ grades }: { grades: LatestGrade[] }) {
  const { t } = useTranslation(['competition', 'common']);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>
          <h2>{t('dashboard.latestGrades')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {grades.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.latestGradesEmpty')}</p>
        ) : (
          <ul className="divide-y">
            {grades.map(({ id, firstname, lastname, clubName, category, apparatus, grade }) => (
              <li key={id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{`${firstname} ${lastname}`}</p>
                  <p className="truncate text-muted-foreground">{clubName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg leading-tight font-bold tabular-nums">{grade}</p>
                  <p className="text-sm text-muted-foreground">
                    {category} {t(`common:apparatus.${apparatus}` as 'common:apparatus.reck')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard({
  loaderData: { stats, grounds, latestGrades },
}: Route.ComponentProps) {
  const { t, i18n } = useTranslation(['competition', 'common']);
  const { competition, contests } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const { starters, clubs, grades, divisions } = stats;
  const base = `/competitions/${competition.id}`;
  const dates = formatDateRange(competition.startDate, competition.endDate, i18n.language);

  return (
    <>
      <title>{`${competition.name} · UTEG`}</title>
      <PageHeader
        title={t('common:nav.dashboard')}
        description={`${competition.location}, ${dates}`}
        actions={<ConnectionBadge status={status} />}
      />
      <div className="grid gap-6">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('dashboard.starters')} value={starters} />
          <Stat label={t('dashboard.clubs')} value={clubs} />
          <Stat label={t('dashboard.grades')} value={grades} />
          <Stat
            label={t('dashboard.divisions')}
            value={divisions.PENDING + divisions.RUNNING + divisions.ENDED}
            detail={t('dashboard.divisionsDetail', {
              running: divisions.RUNNING,
              ended: divisions.ENDED,
            })}
          />
        </dl>

        {starters === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={t('dashboard.noStarters')}
            text={t('dashboard.noStartersText')}
            action={
              <Button asChild>
                <Link to={`${base}/starters`}>{t('dashboard.toStarters')}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="grid gap-4" aria-labelledby="live-title">
              <h2 id="live-title" className="text-lg font-semibold">
                {t('dashboard.live')}
              </h2>
              {divisions.RUNNING === 0 ? (
                <EmptyState
                  icon={ClockIcon}
                  title={t('dashboard.noRunning')}
                  text={t('dashboard.noRunningText')}
                  action={
                    contests.length > 0 && (
                      <Button asChild variant="outline">
                        <Link to={`${base}/contests/${contests[0].id}/divisions`}>
                          {t('dashboard.toDivisions')}
                        </Link>
                      </Button>
                    )
                  }
                />
              ) : (
                grounds.map((ground) => <LiveGroundCard key={ground.ground} ground={ground} />)
              )}
            </section>
            <LatestGrades grades={latestGrades} />
          </div>
        )}
      </div>
    </>
  );
}
