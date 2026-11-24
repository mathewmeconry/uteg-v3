import { rankEntries } from '~/lib/domain/ranking';
import { egtModule } from './module';

const config = egtModule.defaultConfig;

function rankMen(grades: Record<string, Record<string, number>>) {
  return rankEntries(
    Object.entries(grades).map(([id, values]) => ({ id, grades: values })),
    egtModule.apparatus(config, 'MALE'),
    egtModule.rankingOptions(config, 'K5', 'MALE'),
  ).entries.map(({ id, rank }) => [id, rank]);
}

describe('precision', () => {
  it('averages the vault in K6 and K7', () => {
    const averaged = (category: string) =>
      egtModule.rankingOptions(config, category, 'FEMALE').averaged;
    expect(['K5', 'K6', 'K7', 'KD'].map(averaged)).toEqual([[], ['sprung'], ['sprung'], []]);
  });

  it('shows averages with thousandths, also in configs stored before', () => {
    const { averageDecimals: _, ...stored } = config;
    expect(egtModule.configSchema.parse(stored).averageDecimals).toBe(3);
  });

  it.each([2, 3] as const)('ranks by the thousandths when %i are shown', (averageDecimals) => {
    const { entries } = rankEntries(
      [
        { id: 'a', grades: { boden: 9225, sprung: 9075 } },
        { id: 'b', grades: { boden: 9225, sprung: 9080 } },
      ],
      egtModule.apparatus(config, 'FEMALE'),
      egtModule.rankingOptions({ ...config, averageDecimals }, 'K6', 'FEMALE'),
    );
    // Only the vault keeps its thousandths.
    expect(entries.map(({ id, rank, total }) => [id, rank, total])).toEqual([
      ['b', 1, 18310],
      ['a', 2, 18305],
    ]);
  });
});

describe('default tie-break', () => {
  it('compares Boden first, then Schaukelringe, Sprung, Barren and Reck', () => {
    expect(config.tieBreak).toEqual(['boden', 'schaukelringe', 'sprung', 'barren', 'reck']);
  });

  it('lists the higher Boden grade first and keeps the shared rank', () => {
    expect(
      rankMen({
        b: { boden: 9000, schaukelringe: 9500, sprung: 9000, barren: 9000, reck: 9000 },
        a: { boden: 9100, schaukelringe: 9400, sprung: 9000, barren: 9000, reck: 9000 },
        c: { boden: 8000, schaukelringe: 8000, sprung: 8000, barren: 8000, reck: 8000 },
      }),
    ).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });

  it('compares Barren before Reck', () => {
    expect(
      rankMen({
        b: { boden: 9000, schaukelringe: 9000, sprung: 9000, barren: 9000, reck: 9100 },
        a: { boden: 9000, schaukelringe: 9000, sprung: 9000, barren: 9100, reck: 9000 },
      }),
    ).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });
});
