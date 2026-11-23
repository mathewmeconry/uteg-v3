import { describe, expect, it } from 'vitest';
import { pagePath, safeRedirect } from './redirect';

describe('pagePath', () => {
  it.each([
    ['/competitions/1/starters?sex=FEMALE', '/competitions/1/starters?sex=FEMALE'],
    ['/competitions/1.data', '/competitions/1'],
    [
      '/competitions/1/starters.data?sex=FEMALE&_routes=a%2Cb',
      '/competitions/1/starters?sex=FEMALE',
    ],
    ['/competitions/1.data?_routes=a', '/competitions/1'],
    ['/competitions/1/_.data', '/competitions/1/'],
    ['/_root.data', '/'],
    ['/_.data', '/'],
  ])('turns %s into %s', (path, expected) => {
    expect(pagePath(`http://localhost${path}`)).toBe(expected);
  });
});

describe('safeRedirect', () => {
  it.each(['/home', '/competitions/1/starters?sex=FEMALE'])('keeps %s', (target) => {
    expect(safeRedirect(target)).toBe(target);
  });

  it.each([
    null,
    '',
    'home',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/.//evil.example',
  ])('replaces %j', (target) => {
    expect(safeRedirect(target)).toBe('/home');
  });
});
