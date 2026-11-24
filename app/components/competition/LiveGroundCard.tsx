import { CheckIcon, PlayIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Division } from '~/components/divisions/divisionList';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { StatusBadge } from '~/components/StatusBadge';
import { Button } from '~/components/ui/button';
import type { LiveGround } from '~/lib/liveResults.server';
import { RoundMeter } from './RoundMeter';

/** How many of the planned divisions are shown. */
const QUEUE_LENGTH = 3;

/** The running divisions of a ground, where each apparatus is, and what is due next. */
export function LiveGroundCard({
  ground: { ground, divisions, apparatus },
  planned,
  divisionUrl,
  onStart,
}: {
  ground: LiveGround;
  /** The planned divisions of this ground in running order. */
  planned: Division[];
  divisionUrl: (division: { id: string; contestId: string }, page?: 'grading') => string;
  /** For those who can start them. */
  onStart?: (division: Division) => void;
}) {
  const { t } = useTranslation(['competition', 'common']);
  const divisionName = useDivisionName();

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="grid gap-3 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="font-display text-xl leading-tight">
            {t('common:ground', { number: ground })}
          </h3>
          {divisions.length > 0 && (
            <StatusBadge tone="live">{t('common:divisionState.RUNNING')}</StatusBadge>
          )}
        </div>
        {divisions.length === 0 ? (
          <p className="text-muted-foreground">{t('dashboard.groundIdle')}</p>
        ) : (
          <ul className="grid gap-3">
            {divisions.map((division) => {
              const { id, round, rounds, percent } = division;
              const name = divisionName(division);
              return (
                <li key={id} className="grid gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4">
                    <Link
                      to={divisionUrl(division, 'grading')}
                      className="inline-flex items-center font-semibold underline-offset-4 hover:underline pointer-coarse:min-h-11"
                    >
                      {name}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">
                      {t('dashboard.roundOf', { round: Math.min(round + 1, rounds), rounds })}
                    </span>
                  </div>
                  <RoundMeter
                    rounds={rounds}
                    percent={percent}
                    label={t('dashboard.progressLabel', { division: name })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {apparatus.length > 0 && (
        <ul className="divide-y border-t">
          {apparatus.map((item) => (
            <ApparatusRow key={item.apparatus} item={item} />
          ))}
        </ul>
      )}
      {planned.length > 0 && (
        <div className="border-t bg-muted px-4 py-3">
          <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
            {t('dashboard.queue')}
          </h4>
          <ol className="grid gap-1">
            {planned.slice(0, QUEUE_LENGTH).map((division) => (
              <li
                key={division.id}
                className="flex min-h-10 flex-wrap items-center justify-between gap-x-4"
              >
                <span>
                  <Link
                    to={divisionUrl(division)}
                    className="inline-flex items-center font-semibold underline-offset-4 hover:underline pointer-coarse:min-h-11"
                  >
                    {divisionName(division)}
                  </Link>{' '}
                  <span className="text-sm text-muted-foreground">
                    {t('common:starterCount', { count: division.starterCount })}
                  </span>
                </span>
                {onStart && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`${t('common:actions.start')}: ${divisionName(division)}`}
                    onClick={() => onStart(division)}
                  >
                    <PlayIcon aria-hidden />
                    {t('common:actions.start')}
                  </Button>
                )}
              </li>
            ))}
          </ol>
          {planned.length > QUEUE_LENGTH && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('dashboard.queueMore', { count: planned.length - QUEUE_LENGTH })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ApparatusRow({ item }: { item: LiveGround['apparatus'][number] }) {
  const { t } = useTranslation(['competition', 'common']);
  const { apparatus, status, round, isAhead, graded, total, next } = item;

  function detail() {
    if (status === 'FINISHED') return null;
    if (isAhead) return t('dashboard.roundFollows', { round });
    if (total === 0) return t('dashboard.pause');
    return next ? t('dashboard.now', { name: next }) : t('dashboard.toConfirm');
  }

  return (
    <li className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
      <h4 className="font-semibold">
        {t(`common:apparatus.${apparatus}` as 'common:apparatus.reck')}
      </h4>
      <p className="truncate text-sm text-muted-foreground max-sm:col-span-2 max-sm:row-start-2">
        {detail()}
      </p>
      {status === 'FINISHED' ? (
        <StatusBadge tone="done" icon={CheckIcon}>
          {t('dashboard.finished')}
        </StatusBadge>
      ) : isAhead ? (
        <StatusBadge tone="done" icon={CheckIcon}>
          {t('dashboard.ready')}
        </StatusBadge>
      ) : (
        <span className="text-sm tabular-nums">
          {total > 0 && t('dashboard.gradedOf', { graded, total })}
        </span>
      )}
    </li>
  );
}
