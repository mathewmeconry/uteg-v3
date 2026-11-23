import type { RankingOptions } from '~/modules/types';
import { roundGrade } from './grade';

export type Award = 'GOLD' | 'SILVER' | 'BRONZE' | 'HONOUR';

export type RankingInput = { id: string; grades: Partial<Record<string, number>> };

type Ranked<Entry extends RankingInput> = Entry & {
  rank: number;
  total: number;
  award: Award | null;
  /** Rounded grade per apparatus, null where the grade is missing. */
  values: Record<string, number | null>;
};

export type Ranking<Entry extends RankingInput> = {
  entries: Ranked<Entry>[];
  /** Highest rounded grade per apparatus. */
  best: Record<string, number | null>;
};

const MEDALS: Partial<Record<number, Award>> = { 1: 'GOLD', 2: 'SILVER', 3: 'BRONZE' };

export function rankEntries<Entry extends RankingInput>(
  entries: readonly Entry[],
  apparatusList: readonly string[],
  options: RankingOptions,
): Ranking<Entry> {
  const scored = entries
    .map((entry) => {
      const values = Object.fromEntries(
        apparatusList.map((apparatus) => {
          const grade = entry.grades[apparatus];
          return [apparatus, grade === undefined ? null : roundGrade(grade, options.precision)];
        }),
      );
      const total = apparatusList.reduce((sum, apparatus) => sum + (values[apparatus] ?? 0), 0);
      return { ...entry, values, total };
    })
    .toSorted((a, b) => b.total - a.total || compareTieBreak(a.values, b.values, options.tieBreak));

  const quota = getHonourQuota(scored.length, options);
  const ranked: Ranked<Entry>[] = [];
  for (const [index, entry] of scored.entries()) {
    const previous = ranked[index - 1];
    const rank = previous?.total === entry.total ? previous.rank : index + 1;
    const award = MEDALS[rank] ?? (rank <= quota ? 'HONOUR' : null);
    ranked.push({ ...entry, rank, award });
  }

  const best = Object.fromEntries(
    apparatusList.map((apparatus) => [
      apparatus,
      ranked.reduce<number | null>((max, { values }) => {
        const value = values[apparatus];
        return value !== null && (max === null || value > max) ? value : max;
      }, null),
    ]),
  );
  return { entries: ranked, best };
}

/** How many ranks get a medal or an Auszeichnung. */
export function getHonourQuota(
  count: number,
  { honourPercent, honourRounding }: Pick<RankingOptions, 'honourPercent' | 'honourRounding'>,
) {
  // Percentages may have decimals (33.3), which must not push the quota over the next integer.
  const quota = Math.round(count * honourPercent * 1e6) / 1e8;
  return honourRounding === 'ceil' ? Math.ceil(quota) : Math.round(quota);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function compareTieBreak(
  a: Record<string, number | null>,
  b: Record<string, number | null>,
  tieBreak: readonly string[],
) {
  for (const apparatus of tieBreak) {
    const difference = (b[apparatus] ?? 0) - (a[apparatus] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
