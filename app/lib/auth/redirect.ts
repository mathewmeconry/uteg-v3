/** Where to go after signing in. Only paths of this app, so login links can't lead elsewhere. */
export function safeRedirect(target: FormDataEntryValue | null): string {
  if (typeof target !== 'string' || !target.startsWith('/')) return '/home';
  // Browsers read both "//host" and "/\host" as another host and drop tabs and newlines.
  const base = 'http://app.invalid';
  const url = URL.canParse(target, base) ? new URL(target, base) : null;
  return url?.origin === base && !url.pathname.startsWith('//')
    ? url.pathname + url.search
    : '/home';
}
