import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

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
