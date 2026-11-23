import { MedalIcon, StarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatGrade } from '~/lib/domain/grade';
import type { Award } from '~/lib/domain/ranking';
import type { RankingResult } from '~/lib/ranking.server';
import { cn } from '~/lib/utils';

type Ranking = Pick<RankingResult, 'entries' | 'best' | 'apparatus' | 'options'>;

const MEDAL_COLORS: Record<Award, string> = {
  GOLD: 'text-gold',
  SILVER: 'text-silver',
  BRONZE: 'text-bronze',
  HONOUR: 'text-primary',
};

function AwardIcon({ award }: { award: Award | null }) {
  const { t } = useTranslation('ranking');
  if (!award) return null;
  const Icon = award === 'HONOUR' ? StarIcon : MedalIcon;
  return (
    <span className="inline-flex align-middle" title={t(`awards.${award}`)}>
      <Icon aria-hidden className={cn('size-5', MEDAL_COLORS[award])} />
      <span className="sr-only">{t(`awards.${award}`)}</span>
    </span>
  );
}

function Grade({
  value,
  best,
  precision,
}: {
  value: number | null;
  best: number | null;
  precision: 2 | 3;
}) {
  const { t } = useTranslation('ranking');
  if (value === null) return <span className="text-muted-foreground">–</span>;
  const grade = formatGrade(value, precision);
  if (value !== best) return grade;
  return (
    <span
      title={t('best')}
      className="-mx-1 rounded-sm bg-brand px-1 font-bold text-brand-foreground"
    >
      {grade}
      <span className="sr-only"> ({t('best')})</span>
    </span>
  );
}

/** A table, on phones a list of cards. */
export function RankingList({ entries, best, apparatus, options }: Ranking) {
  const { t } = useTranslation(['ranking', 'common']);
  const { precision } = options;

  return (
    <>
      <ol className="grid grid-cols-1 gap-2 md:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start gap-3">
              <span className="min-w-7 text-lg font-bold tabular-nums">{entry.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold wrap-anywhere">
                  {entry.firstname} {entry.lastname}
                </p>
                <p className="text-sm wrap-anywhere text-muted-foreground">{entry.clubName}</p>
              </div>
              <AwardIcon award={entry.award} />
              <span className="text-lg font-bold tabular-nums">
                {formatGrade(entry.total, precision)}
              </span>
            </div>
            <dl
              className="mt-2 grid gap-1 text-center text-sm tabular-nums"
              style={{ gridTemplateColumns: `repeat(${apparatus.length}, minmax(0, 1fr))` }}
            >
              {apparatus.map((key) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">
                    <abbr title={t(`common:apparatus.${key as 'reck'}`)} className="no-underline">
                      {t(`common:apparatusShort.${key as 'reck'}`)}
                    </abbr>
                  </dt>
                  <dd>
                    <Grade value={entry.values[key]} best={best[key]} precision={precision} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>

      <div className="hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">{t('rank')}</TableHead>
              <TableHead>{t('common:fields.name')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('common:fields.club')}</TableHead>
              {apparatus.map((key) => (
                <TableHead key={key} className="text-right">
                  <abbr title={t(`common:apparatus.${key as 'reck'}`)} className="no-underline">
                    {t(`common:apparatusShort.${key as 'reck'}`)}
                  </abbr>
                </TableHead>
              ))}
              <TableHead className="text-right">{t('total')}</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">{t('award')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-right font-bold">{entry.rank}</TableCell>
                <TableCell className="min-w-40 font-medium wrap-anywhere whitespace-normal">
                  {entry.firstname} {entry.lastname}
                  <span className="block font-normal text-muted-foreground lg:hidden">
                    {entry.clubName}
                  </span>
                </TableCell>
                <TableCell className="hidden min-w-40 wrap-anywhere whitespace-normal lg:table-cell">
                  {entry.clubName}
                </TableCell>
                {apparatus.map((key) => (
                  <TableCell key={key} className="text-right">
                    <Grade value={entry.values[key]} best={best[key]} precision={precision} />
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold">
                  {formatGrade(entry.total, precision)}
                </TableCell>
                <TableCell>
                  <AwardIcon award={entry.award} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
