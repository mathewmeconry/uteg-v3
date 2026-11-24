import type { RankingOptions } from '~/modules/types';
import { getHonourQuota, getShownDecimals, rankEntries } from './ranking';

const WOMEN = ['reck', 'boden', 'schaukelringe', 'sprung'];

const OPTIONS: RankingOptions = {
  tieBreak: ['schaukelringe', 'boden', 'reck', 'barren'],
  precision: 2,
  averaged: [],
  averageDecimals: 3,
  honourPercent: 33,
  honourRounding: 'round',
};

function grades(reck: number, boden = 0, schaukelringe = 0, sprung = 0) {
  return { reck, boden, schaukelringe, sprung };
}

function rank(totals: number[], options: Partial<RankingOptions> = {}) {
  return rankEntries(
    totals.map((total, index) => ({ id: String(index), grades: { reck: total } })),
    WOMEN,
    { ...OPTIONS, ...options },
  ).entries;
}

describe('getShownDecimals', () => {
  const shown = (options: Partial<RankingOptions>) =>
    ['reck', 'sprung', undefined].map((apparatus) =>
      getShownDecimals({ ...OPTIONS, ...options }, apparatus),
    );

  it('only shows thousandths of averages and totals with one', () => {
    expect(shown({})).toEqual([2, 2, 2]);
    expect(shown({ averaged: ['sprung'] })).toEqual([2, 3, 3]);
    expect(shown({ averaged: ['sprung'], averageDecimals: 2 })).toEqual([2, 2, 2]);
  });

  it('is never less than the precision', () => {
    expect(shown({ averaged: ['sprung'], averageDecimals: 2, precision: 3 })).toEqual([3, 3, 3]);
  });
});

describe('rankEntries', () => {
  it('sums the apparatus, a missing grade counts 0', () => {
    const { entries } = rankEntries(
      [
        { id: 'a', grades: { reck: 9000, boden: 8000 } },
        { id: 'b', grades: grades(9000, 9000, 9000, 9000) },
      ],
      WOMEN,
      OPTIONS,
    );
    expect(entries.map(({ id, total, rank }) => [id, total, rank])).toEqual([
      ['b', 36000, 1],
      ['a', 17000, 2],
    ]);
    expect(entries[1].values).toEqual({
      reck: 9000,
      boden: 8000,
      schaukelringe: null,
      sprung: null,
    });
  });

  it('ignores grades on other apparatus', () => {
    const { entries } = rankEntries(
      [{ id: 'a', grades: { reck: 9000, barren: 9000 } }],
      WOMEN,
      OPTIONS,
    );
    expect(entries[0].total).toBe(9000);
  });

  it('rounds each grade before summing', () => {
    const list = [{ id: 'a', grades: grades(9225, 9225, 9224, 9000) }];
    expect(rankEntries(list, WOMEN, OPTIONS).entries[0].total).toBe(36680);
    expect(rankEntries(list, WOMEN, { ...OPTIONS, precision: 3 }).entries[0].total).toBe(36674);
  });

  it('shares ranks and skips the next one', () => {
    expect(rank([9500, 9400, 9300, 9300, 9200]).map((entry) => entry.rank)).toEqual([
      1, 2, 3, 3, 5,
    ]);
  });

  it('gives medals by rank and then the Auszeichnung', () => {
    const awards = rank([9900, 9800, 9700, 9600, 9500, 9400], { honourPercent: 67 }).map(
      (entry) => entry.award,
    );
    expect(awards).toEqual(['GOLD', 'SILVER', 'BRONZE', 'HONOUR', null, null]);
  });

  it('gives shared medals', () => {
    expect(rank([9900, 9900, 9700]).map((entry) => entry.award)).toEqual([
      'GOLD',
      'GOLD',
      'BRONZE',
    ]);
  });

  it('gives everyone on the last honoured rank the Auszeichnung', () => {
    const awards = rank([9900, 9800, 9700, 9600, 9600, 9400], { honourPercent: 67 }).map(
      (entry) => entry.award,
    );
    expect(awards).toEqual(['GOLD', 'SILVER', 'BRONZE', 'HONOUR', 'HONOUR', null]);
  });

  it('gives medals even when the quota is lower', () => {
    expect(rank([9900, 9800, 9700, 9600], { honourPercent: 0 }).map(({ award }) => award)).toEqual([
      'GOLD',
      'SILVER',
      'BRONZE',
      null,
    ]);
  });

  it('orders ties by the tie-break without changing the rank', () => {
    const { entries } = rankEntries(
      [
        { id: 'boden', grades: grades(9000, 9500, 9000, 9000) },
        { id: 'ringe', grades: grades(9000, 9000, 9500, 9000) },
        { id: 'reck', grades: grades(9500, 9000, 9000, 9000) },
      ],
      WOMEN,
      OPTIONS,
    );
    expect(entries.map(({ id, rank }) => [id, rank])).toEqual([
      ['ringe', 1],
      ['boden', 1],
      ['reck', 1],
    ]);
  });

  it('keeps the given order for complete ties', () => {
    expect(rank([9000, 9000]).map(({ id }) => id)).toEqual(['0', '1']);
  });

  it('finds the best value per apparatus', () => {
    const { best } = rankEntries(
      [
        { id: 'a', grades: { reck: 9000, boden: 9300 } },
        { id: 'b', grades: { reck: 9100, boden: 0 } },
      ],
      WOMEN,
      OPTIONS,
    );
    expect(best).toEqual({ reck: 9100, boden: 9300, schaukelringe: null, sprung: null });
  });

  it('handles an empty list', () => {
    expect(rankEntries([], ['reck'], OPTIONS)).toEqual({ entries: [], best: { reck: null } });
  });
});

describe('getHonourQuota', () => {
  it.each([
    [28, 12],
    [49, 20],
    [51, 21],
    [50, 20],
  ])('rounds 40%% of %i up to %i like the SM', (count, quota) => {
    expect(getHonourQuota(count, { honourPercent: 40, honourRounding: 'ceil' })).toBe(quota);
  });

  it.each([
    [28, 11],
    [10, 3],
    [5, 2],
    [4, 1],
  ])('rounds 33%% (40%% for 28) of %i to %i', (count, quota) => {
    const honourPercent = count === 28 ? 40 : 33;
    expect(getHonourQuota(count, { honourPercent, honourRounding: 'round' })).toBe(quota);
  });

  it('is not thrown off by floating point', () => {
    expect(getHonourQuota(50, { honourPercent: 14, honourRounding: 'ceil' })).toBe(7);
    expect(getHonourQuota(1000, { honourPercent: 33.3, honourRounding: 'ceil' })).toBe(333);
  });
});
