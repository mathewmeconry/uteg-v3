import { ArrowRightIcon, ChevronRightIcon, PlusIcon, TrophyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Route } from './+types/index';
import { DateBlock } from '~/components/competition/DateBlock';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { StatusBadge } from '~/components/StatusBadge';
import { Button } from '~/components/ui/button';
import { getUser } from '~/lib/auth/auth.server';
import { getStats, listCompetitions } from '~/lib/competitions.server';
import { getPhase, getTiming } from '~/lib/domain/competitionPhase';
import { formatDateRange } from '~/lib/format';

export async function loader({ context }: Route.LoaderArgs) {
  const now = new Date();
  const competitions = await listCompetitions(getUser(context).id);
  return {
    competitions: await Promise.all(
      competitions.map(async ({ id, name, location, startDate, endDate, logoId }) => {
        const timing = getTiming({ startDate, endDate }, now);
        // The past ones have nothing left to do.
        const phase = timing === 'past' ? null : getPhase(await getStats(id));
        return { id, name, location, startDate, endDate, logoId, timing, phase };
      }),
    ),
  };
}

type Competition = Route.ComponentProps['loaderData']['competitions'][number];

export default function Home({ loaderData: { competitions } }: Route.ComponentProps) {
  const { t } = useTranslation('competition');
  const newButton = (
    <Button asChild>
      <Link to="/competitions/new">
        <PlusIcon aria-hidden />
        {t('new')}
      </Link>
    </Button>
  );
  const groups = [
    { key: 'today', items: competitions.filter(({ timing }) => timing === 'today') },
    {
      key: 'upcoming',
      // The next one first.
      items: competitions.filter(({ timing }) => timing === 'upcoming').toReversed(),
    },
    { key: 'past', items: competitions.filter(({ timing }) => timing === 'past') },
  ] as const;

  return (
    <>
      <title>{`${t('listTitle')} · UTEG`}</title>
      <PageHeader title={t('listTitle')} actions={competitions.length > 0 && newButton} />
      {competitions.length === 0 && (
        <EmptyState
          icon={TrophyIcon}
          title={t('emptyTitle')}
          text={t('emptyText')}
          action={newButton}
        />
      )}
      <div className="grid gap-9">
        {groups.map(
          ({ key, items }) =>
            items.length > 0 && (
              <section key={key} aria-labelledby={`${key}-title`}>
                <h2 id={`${key}-title`} className="mb-3 font-display text-lg">
                  {t(`home.${key}`)}
                </h2>
                {key === 'today' ? (
                  <ul className="grid gap-3">
                    {items.map((competition) => (
                      <li key={competition.id}>
                        <TodayCard competition={competition} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                    {items.map((competition) => (
                      <li key={competition.id}>
                        <CompetitionRow competition={competition} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ),
        )}
      </div>
    </>
  );
}

function TodayCard({ competition }: { competition: Competition }) {
  const { t, i18n } = useTranslation('competition');
  const { id, name, location, startDate, endDate, logoId, phase } = competition;

  return (
    <Link
      to={`/competitions/${id}`}
      className="group grid gap-5 rounded-xl bg-ink p-5 text-ink-foreground sm:grid-cols-[1fr_auto] sm:items-end sm:p-6 dark:border"
    >
      <div className="min-w-0">
        {phase && (
          <StatusBadge
            tone={phase === 'running' ? 'live' : 'neutral'}
            className={
              phase === 'running'
                ? undefined
                : 'border-ink-accent bg-ink-accent text-ink-foreground'
            }
          >
            {t(`home.status.${phase}`)}
          </StatusBadge>
        )}
        <p className="mt-3 font-display text-2xl leading-tight wrap-anywhere sm:text-3xl">{name}</p>
        <p className="mt-1 text-ink-muted">
          {location}, {formatDateRange(startDate, endDate, i18n.language)}
        </p>
      </div>
      <div className="flex items-center gap-4 sm:flex-col sm:items-end">
        {logoId && (
          <img
            src={`/api/assets/${logoId}`}
            alt=""
            className="h-14 max-w-40 rounded-md bg-white object-contain p-1.5"
          />
        )}
        <span className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground group-hover:bg-brand/90">
          {t(`home.next.${phase ?? 'ended'}`)}
          <ArrowRightIcon aria-hidden className="size-4" />
        </span>
      </div>
    </Link>
  );
}

function CompetitionRow({ competition }: { competition: Competition }) {
  const { t, i18n } = useTranslation('competition');
  const { id, name, location, startDate, endDate, logoId, phase } = competition;

  return (
    <Link
      to={`/competitions/${id}`}
      className="flex items-center gap-4 p-3 outline-offset-[-2px] hover:bg-muted sm:pr-4"
    >
      <DateBlock
        date={startDate}
        className={phase ? undefined : 'bg-muted text-muted-foreground'}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold wrap-anywhere">{name}</p>
        <p className="text-sm text-muted-foreground">
          {location}, {formatDateRange(startDate, endDate, i18n.language)}
        </p>
        {phase && (
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">{t('home.nextStep')}</span>{' '}
            <span className="font-semibold text-primary">{t(`home.next.${phase}`)}</span>
          </p>
        )}
      </div>
      {logoId && (
        <img
          src={`/api/assets/${logoId}`}
          alt=""
          className="hidden h-10 max-w-28 object-contain sm:block dark:rounded-sm dark:bg-white dark:p-1"
        />
      )}
      <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
