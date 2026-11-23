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
    <span className="inline-flex items-center gap-1.5 align-middle" title={t(`awards.${award}`)}>
      <Icon aria-hidden className={cn('size-5 fill-current/25', MEDAL_COLORS[award])} />
      <span className="sr-only text-sm 2xl:not-sr-only">{t(`awards.${award}`)}</span>
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
      className="-mx-1 rounded-sm bg-brand px-1 font-semibold text-brand-foreground"
    >
      {grade}
      <span className="sr-only"> ({t('best')})</span>
    </span>
  );
}

/** A table, on phones a list. */
export function RankingList({ entries, best, apparatus, options }: Ranking) {
  const { t } = useTranslation(['ranking', 'common']);
  const { precision } = options;
  // Below the last award there is a line.
  const lastAward = entries.findLastIndex(({ award }) => award);
  const isLimit = (index: number) => index === lastAward && index < entries.length - 1;

  return (
    <>
      <ol className="grid grid-cols-1 divide-y overflow-hidden rounded-xl border bg-card md:hidden">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className={cn('px-3 py-3', isLimit(index) && 'border-b-2 border-b-primary')}
          >
            <div className="flex items-start gap-3">
              <span className="figure min-w-7 text-2xl leading-none">{entry.rank}</span>
              <div className="min-w-0 flex-1 leading-snug">
                <p className="font-semibold wrap-anywhere">
                  {entry.firstname} {entry.lastname}
                </p>
                <p className="text-sm wrap-anywhere text-muted-foreground">{entry.clubName}</p>
              </div>
              <AwardIcon award={entry.award} />
              <span className="figure text-2xl leading-none">
                {formatGrade(entry.total, precision)}
              </span>
            </div>
            <dl
              className="mt-2 grid gap-1 pl-10 text-sm tabular-nums"
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

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        {/* Five apparatus also fit next to the sidebar of a tablet. */}
        <Table className="max-lg:[&_td]:px-1.5 max-lg:[&_th]:px-1.5">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">{t('rank')}</TableHead>
              <TableHead>{t('common:fields.name')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('common:fields.club')}</TableHead>
              {apparatus.map((key) => (
                <TableHead key={key} className="text-right">
                  <span aria-hidden className="hidden 2xl:inline">
                    {t(`common:apparatus.${key as 'reck'}`)}
                  </span>
                  <abbr
                    title={t(`common:apparatus.${key as 'reck'}`)}
                    className="no-underline 2xl:sr-only"
                  >
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
            {entries.map((entry, index) => (
              <TableRow
                key={entry.id}
                className={cn(isLimit(index) && 'border-b-2 border-b-primary')}
              >
                <TableCell className="figure text-right text-lg">{entry.rank}</TableCell>
                <TableCell className="min-w-32 font-semibold wrap-anywhere whitespace-normal">
                  {entry.firstname} {entry.lastname}
                  <span className="block font-normal text-muted-foreground lg:hidden">
                    {entry.clubName}
                  </span>
                </TableCell>
                <TableCell className="hidden min-w-40 wrap-anywhere whitespace-normal text-muted-foreground lg:table-cell">
                  {entry.clubName}
                </TableCell>
                {apparatus.map((key) => (
                  <TableCell key={key} className="text-right">
                    <Grade value={entry.values[key]} best={best[key]} precision={precision} />
                  </TableCell>
                ))}
                <TableCell className="figure text-right text-lg">
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
