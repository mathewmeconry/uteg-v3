import { readTheme } from './theme';

it.each([
  [null, 'system'],
  ['theme=light', 'light'],
  ['a=b; theme=dark; c=d', 'dark'],
  ['mytheme=dark', 'system'],
  ['theme=pink', 'system'],
])('reads %s', (cookies, theme) => {
  expect(readTheme(cookies)).toBe(theme);
});
