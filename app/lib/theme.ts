export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** The theme chosen on this device, in a cookie so the server renders it. */
export function readTheme(cookies: string | null): Theme {
  const value = /(?:^|; )theme=(\w+)/.exec(cookies ?? '')?.[1];
  return THEMES.find((theme) => theme === value) ?? 'system';
}

/** Applies it at once and remembers it for a year. */
export function setTheme(theme: Theme) {
  document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.dataset.theme = theme;
}
