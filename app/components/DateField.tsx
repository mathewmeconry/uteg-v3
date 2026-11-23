import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { Input } from '~/components/ui/input';
import { formatDay } from '~/lib/format';

/**
 * The browser's date input, which writes dates in the language of the browser. Until it is used it
 * shows them in the one of the app, with the weekday.
 */
export function DateField({
  label,
  error,
  value,
  ...inputProps
}: {
  label: ReactNode;
  error?: string;
  /** Like 2026-05-09, empty without a date. */
  value: string;
} & Omit<ComponentProps<typeof Input>, 'value' | 'type' | 'children' | 'id'>) {
  const { t, i18n } = useTranslation();
  const date = new Date(value);
  // While typing a year it may be one that cannot be shown.
  const text = Number.isNaN(date.getTime()) ? t('chooseDate') : formatDay(date, i18n.language);

  return (
    <FormField label={label} error={error}>
      {(props) => (
        <span className="relative block">
          <Input
            {...inputProps}
            {...props}
            type="date"
            value={value}
            className="peer not-focus:text-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-10 left-3 flex items-center truncate text-base peer-focus:hidden md:text-sm"
          >
            {text}
          </span>
        </span>
      )}
    </FormField>
  );
}
