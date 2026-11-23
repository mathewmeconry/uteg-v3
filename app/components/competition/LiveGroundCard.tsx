import { CheckIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '~/components/StatusBadge';
import type { LiveGround } from '~/lib/liveResults.server';
import { cn } from '~/lib/utils';
import { RoundMeter } from './RoundMeter';

/** The running divisions of a ground, and the round and last grades of each apparatus. */
export function LiveGroundCard({
  ground: { ground, divisions, apparatus },
}: {
  ground: LiveGround;
}) {
  const { t } = useTranslation(['competition', 'common']);

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-[11rem_1fr]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:block">
          <h3 className="font-display text-xl leading-tight">
            {t('common:ground', { number: ground })}
          </h3>
          {divisions.length > 0 && (
            <StatusBadge tone="live" className="sm:mt-1.5">
              {t('common:divisionState.RUNNING')}
            </StatusBadge>
          )}
        </div>
        {divisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.groundIdle')}</p>
        ) : (
          <ul className="grid content-center gap-3">
            {divisions.map(({ id, category, sex, number, round, rounds, percent }) => {
              const name = `${category} ${t(`common:sex.${sex}`)}, ${t('dashboard.division', { number })}`;
              return (
                <li key={id} className="grid gap-1.5">
                  <div className="flex flex-wrap justify-between gap-x-4">
                    <span className="font-semibold">{name}</span>
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
        <ul
          className="grid gap-px border-t bg-border sm:grid-cols-2 2xl:grid-cols-[repeat(var(--count),minmax(0,1fr))]"
          style={{ '--count': apparatus.length } as CSSProperties}
        >
          {apparatus.map((item) => (
            <ApparatusCell key={item.apparatus} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApparatusCell({ item }: { item: LiveGround['apparatus'][number] }) {
  const { t } = useTranslation(['competition', 'common']);
  const { apparatus, status, round, rounds, graded, total, latest } = item;
  const isFinished = status === 'FINISHED';

  return (
    <li className="bg-card px-4 py-3 sm:max-2xl:last:odd:col-span-2">
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3">
        <h4 className="font-semibold">
          {t(`common:apparatus.${apparatus}` as 'common:apparatus.reck')}
        </h4>
        {isFinished ? (
          <StatusBadge tone="done" icon={CheckIcon}>
            {t('dashboard.finished')}
          </StatusBadge>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="sr-only">{t('dashboard.roundOf', { round, rounds })}, </span>
            {total === 0 ? (
              t('dashboard.pause')
            ) : (
              <span className={cn(graded === total && 'font-semibold text-success')}>
                {t('dashboard.gradedOf', { graded, total })}
              </span>
            )}
          </p>
        )}
      </div>
      {latest.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.noGrades')}</p>
      ) : (
        // The last of an odd number is twice as wide, see above.
        <ul className="mt-1.5 grid gap-1.5 sm:max-2xl:in-[li:last-child:nth-child(odd)]:grid-cols-2 sm:max-2xl:in-[li:last-child:nth-child(odd)]:gap-x-8">
          {latest.map(({ entryId, firstname, lastname, clubName, grade }, index) => (
            <li
              key={entryId}
              // The one before is only interesting where there is room.
              className={cn(
                'flex items-center justify-between gap-3',
                index > 0 && 'max-sm:hidden',
              )}
            >
              <div className="min-w-0 text-sm leading-snug">
                <p className="truncate">{`${firstname} ${lastname}`}</p>
                <p className="truncate text-muted-foreground">{clubName}</p>
              </div>
              <span className="figure text-xl">{grade}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
