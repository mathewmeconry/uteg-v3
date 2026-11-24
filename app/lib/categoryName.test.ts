import { NAMESPACES } from '~/locales';
import { categoryName } from './categoryName';
import { createI18n } from './i18n';

it.each([
  ['de', 'K5', 'K5'],
  ['en', 'KD', 'KD'],
  ['fr', 'K5', 'C5'],
  ['fr', 'KH', 'CH'],
  ['fr', 'Kader', 'Kader'],
] as const)('%s: %s is %s', (language, category, expected) => {
  expect(categoryName(category, createI18n(language).getFixedT(null, NAMESPACES))).toBe(expected);
  // Also where the namespace of the component is another one.
  expect(categoryName(category, createI18n(language).getFixedT(null, 'judging'))).toBe(expected);
});
