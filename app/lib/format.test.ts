import { formatDateRange, formatDay } from './format';

it.each([
  ['de', '2026-05-09', '2026-05-09', '9. Mai 2026'],
  ['de', '2026-05-09', '2026-05-10', '9.–10. Mai 2026'],
  ['de', '2026-05-30', '2026-06-01', '30. Mai – 1. Juni 2026'],
  ['de', '2026-12-31', '2027-01-01', '31. Dezember 2026 – 1. Januar 2027'],
  ['de', '2026-05-09', '2027-05-09', '9. Mai 2026 – 9. Mai 2027'],
  ['en', '2026-05-09', '2026-05-10', '9–10 May 2026'],
  ['en', '2026-05-30', '2026-06-01', '30 May – 1 June 2026'],
  ['fr', '2026-05-09', '2026-05-10', '9–10 mai 2026'],
  ['fr', '2026-05-30', '2026-06-01', '30 mai – 1 juin 2026'],
])('%s: %s to %s', (language, start, end, expected) => {
  expect(formatDateRange(new Date(start), new Date(end), language)).toBe(expected);
});

it('names the weekday of a day', () => {
  expect(formatDay(new Date('2026-05-09'), 'de')).toBe('Samstag, 9. Mai 2026');
});
