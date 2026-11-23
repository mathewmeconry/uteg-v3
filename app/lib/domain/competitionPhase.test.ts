import { getPhase, getTiming } from './competitionPhase';

it.each([
  ['starters', 0, [0, 0, 0]],
  ['starters', 0, [2, 0, 0]],
  ['divisions', 5, [0, 0, 0]],
  ['start', 5, [2, 0, 0]],
  ['running', 5, [2, 1, 1]],
  ['continue', 5, [1, 0, 1]],
  ['ended', 5, [0, 0, 2]],
] as const)('%s with %i starters and divisions %j', (phase, starters, [PENDING, RUNNING, ENDED]) => {
  expect(getPhase({ starters, divisions: { PENDING, RUNNING, ENDED } })).toBe(phase);
});

it.each([
  ['upcoming', '2026-05-08T21:59:00Z'],
  // Midnight in Switzerland.
  ['today', '2026-05-08T22:00:00Z'],
  ['today', '2026-05-10T21:59:00Z'],
  ['past', '2026-05-10T22:00:00Z'],
])('is %s at %s', (timing, now) => {
  const dates = { startDate: new Date('2026-05-09'), endDate: new Date('2026-05-10') };
  expect(getTiming(dates, new Date(now))).toBe(timing);
});
