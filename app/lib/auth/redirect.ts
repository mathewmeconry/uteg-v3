/**
 * The address of the page a request is for. Navigations in the browser ask for its data instead, at
 * an address that shows no page.
 */
export function pagePath(requestUrl: string): string {
  const { pathname, searchParams } = new URL(requestUrl);
  if (!pathname.endsWith('.data')) return pathname + new URL(requestUrl).search;
  searchParams.delete('_routes');
  const search = searchParams.size > 0 ? `?${searchParams}` : '';
  return pathname.replace(/(\/_root|\/_)?\.data$/, (_, index) => (index ? '/' : '')) + search;
}

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
