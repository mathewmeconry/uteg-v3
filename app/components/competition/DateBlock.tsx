import { useTranslation } from 'react-i18next';
import { dateLocale } from '~/lib/format';
import { cn } from '~/lib/utils';

/** The first day like on a calendar sheet. Decorative, the full dates are next to it. */
export function DateBlock({ date, className }: { date: Date; className?: string }) {
  const { i18n } = useTranslation();
  // Shortened here: the short names differ between the ICU versions of Node and browsers.
  const month = new Intl.DateTimeFormat(dateLocale(i18n.language), {
    month: 'long',
    timeZone: 'UTC',
  }).format(date);

  return (
    <span
      aria-hidden
      className={cn('grid w-16 shrink-0 justify-items-center rounded-lg bg-accent py-2', className)}
    >
      <span className="figure text-3xl leading-none">{date.getUTCDate()}</span>
      <span className="mt-1 text-sm leading-none font-semibold">
        {/* Juin and juillet only differ in the fourth letter. */}
        {month.slice(0, i18n.language === 'fr' ? 4 : 3)}
      </span>
    </span>
  );
}
