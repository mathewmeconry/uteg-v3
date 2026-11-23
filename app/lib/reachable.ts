/** A failing loader would replace the page, and what was typed on it, with the error page. */
export async function isServerReachable() {
  try {
    const response = await fetch('/healthz', { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}
