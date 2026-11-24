import { formatEntered } from '~/lib/domain/gradeInput';

/** In thousandths. `others` is the sum of the other apparatus. */
export const DEMO_STARTER = {
  name: 'Lea Brunner',
  club: 'TV Lenzburg',
  others: 27_650,
};

const RIVALS = [
  { name: 'Mia Frei', club: 'TV Muri', others: 27_650, floor: 9_350 },
  { name: 'Nina Egli', club: 'TV Zofingen', others: 27_550, floor: 9_250 },
  { name: 'Sara Huber', club: 'STV Wettingen', others: 27_350, floor: 9_100 },
];

/** The ranking of the demo with the grade a visitor entered. */
export function rankDemo(grade: number | null) {
  const entries = [...RIVALS, { ...DEMO_STARTER, floor: grade }]
    .map((entry) => ({ ...entry, sum: entry.others + (entry.floor ?? 0) }))
    .sort((a, b) => b.sum - a.sum);
  return entries.map(({ name, club, floor, sum }) => ({
    name,
    club,
    rank: 1 + entries.filter((other) => other.sum > sum).length,
    floor: floor === null ? '–' : formatEntered(floor),
    total: formatEntered(sum),
  }));
}
