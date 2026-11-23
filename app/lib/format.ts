/**
 * Competition dates are plain days stored at midnight UTC. Formatting them in UTC shows the same
 * day on the server and in every browser.
 */
export function formatDateRange(start: Date, end: Date, language: string) {
  const format = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-CH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const first = format.format(start);
  const last = format.format(end);
  // Not formatRange: its spaces differ between the ICU versions of Node and browsers.
  return first === last ? first : `${first} – ${last}`;
}
