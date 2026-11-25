/** The locale for the dates of a language of the app. */
export function dateLocale(language: string) {
  if (language === 'en') return 'en-GB';
  return language === 'fr' ? 'fr-CH' : 'de-CH';
}

/** The day of a point in time, always in Swiss time, e.g. 09.05.2026. */
export function formatDate(date: Date, language: string) {
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Zurich',
  }).format(date);
}

/** Point in time, always in Swiss time, e.g. 09.05.2026, 14:03. */
export function formatDateTime(date: Date, language: string) {
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich',
  }).format(date);
}

/**
 * Competition dates are plain days stored at midnight UTC. Formatting them in UTC shows the same
 * day on the server and in every browser.
 */
export function formatDateRange(start: Date, end: Date, language: string) {
  const locale = dateLocale(language);
  function format(date: Date, options: Intl.DateTimeFormatOptions) {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC', ...options }).format(
      date,
    );
  }
  const last = format(end, { month: 'long', year: 'numeric' });
  // Not formatRange: its spaces differ between the ICU versions of Node and browsers.
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${format(start, { month: 'long', year: 'numeric' })} – ${last}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${format(start, { month: 'long' })} – ${last}`;
  }
  if (start.getUTCDate() === end.getUTCDate()) return last;
  return `${start.getUTCDate()}${language === 'de' ? '.' : ''}–${last}`;
}

/** A plain day, see formatDateRange, with its weekday. */
export function formatDay(date: Date, language: string) {
  return new Intl.DateTimeFormat(dateLocale(language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
