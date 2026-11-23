import { CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import type { LiveGround } from '~/lib/liveResults.server';

/** The running divisions of a ground, and the round and last grades of each apparatus. */
export function LiveGroundCard({
  ground: { ground, divisions, apparatus },
}: {
  ground: LiveGround;
}) {
  const { t } = useTranslation(['competition', 'common']);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>
          <h3>{t('common:ground', { number: ground })}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {divisions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('dashboard.groundIdle')}</p>
        )}
        {divisions.length > 0 && (
          <ul className="grid gap-3">
            {divisions.map(({ id, category, sex, number, round, rounds, percent }) => {
              const name = `${category} ${t(`common:sex.${sex}`)}, ${t('dashboard.division', { number })}`;
              return (
                <li key={id} className="grid gap-1.5">
                  <div className="flex flex-wrap justify-between gap-x-4 text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {t('dashboard.roundOf', { round: Math.min(round + 1, rounds), rounds })}
                    </span>
                  </div>
                  <Progress
                    value={percent}
                    aria-label={t('dashboard.progressLabel', { division: name })}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {apparatus.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {apparatus.map((item) => (
              <ApparatusTile key={item.apparatus} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ApparatusTile({ item }: { item: LiveGround['apparatus'][number] }) {
  const { t } = useTranslation(['competition', 'common']);
  const { apparatus, status, round, rounds, graded, total, latest } = item;
  const isFinished = status === 'FINISHED';

  return (
    <li className="grid content-start gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium">
          {t(`common:apparatus.${apparatus}` as 'common:apparatus.reck')}
        </h4>
        {isFinished && (
          <Badge className="bg-success text-success-foreground">
            <CheckIcon aria-hidden />
            {t('dashboard.finished')}
          </Badge>
        )}
      </div>
      {!isFinished && (
        <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground tabular-nums">
          <span>{t('dashboard.roundOf', { round, rounds })}</span>
          <span>
            {total === 0 ? t('dashboard.pause') : t('dashboard.gradedOf', { graded, total })}
          </span>
        </p>
      )}
      {latest.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dashboard.noGrades')}</p>
      ) : (
        <ul className="grid gap-2">
          {latest.map(({ entryId, firstname, lastname, clubName, grade }) => (
            <li key={entryId} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{`${firstname} ${lastname}`}</p>
                <p className="truncate text-muted-foreground">{clubName}</p>
              </div>
              <span className="text-lg font-bold tabular-nums">{grade}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
