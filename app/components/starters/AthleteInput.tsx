import { useId, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import { fullName } from './starterRow';
import type { AthleteSuggestion } from './useAthleteSuggestions';

/** An input with a list of athletes to pick from. Anything else can be typed as well. */
export function AthleteInput({
  suggestions: offered,
  startingIds,
  onPick,
  label,
  error,
  hint,
  ...inputProps
}: {
  /** Null for a plain input. */
  suggestions: AthleteSuggestion[] | null;
  /** Athletes that already take part. */
  startingIds: ReadonlySet<string>;
  onPick: (athlete: AthleteSuggestion) => void;
  label: string;
  error?: string;
  hint?: ReactNode;
} & ComponentProps<typeof Input>) {
  const { t } = useTranslation(['starters', 'common']);
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = offered ?? [];
  const open = suggestions.length > 0;
  const active = suggestions[activeIndex];
  const optionId = (index: number) => `${listId}-${index}`;

  function handleKeyDown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // -1 is the input itself.
      const count = suggestions.length + 1;
      setActiveIndex((index) => ((index + 1 + step + count) % count) - 1);
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      setActiveIndex(-1);
      onPick(active);
    }
  }

  return (
    <div className="relative">
      <FormField label={label} error={error} hint={hint}>
        {(controlProps) => (
          <Input
            {...inputProps}
            {...controlProps}
            autoComplete="off"
            {...(offered && {
              role: 'combobox',
              'aria-autocomplete': 'list',
              'aria-expanded': open,
              'aria-controls': open ? listId : undefined,
              'aria-activedescendant': active ? optionId(activeIndex) : undefined,
              onKeyDown: handleKeyDown,
            })}
          />
        )}
      </FormField>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('form.suggestions')}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {suggestions.map((athlete, index) => (
            // The input keeps the focus and handles the keys, see aria-activedescendant.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={athlete.athleteId}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                'flex min-h-11 cursor-pointer flex-col justify-center rounded-sm px-2 py-1 hover:bg-accent',
                index === activeIndex && 'bg-accent',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(athlete)}
            >
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{fullName(athlete)}</span>
                <span className="text-muted-foreground">{athlete.birthYear}</span>
                {startingIds.has(athlete.athleteId) && (
                  <Badge variant="secondary">{t('form.alreadyStarts')}</Badge>
                )}
              </span>
              <span className="text-muted-foreground">
                {[
                  t(`common:sex.${athlete.sex}`),
                  athlete.club?.name,
                  athlete.stvId && `${t('common:fields.stvId')} ${athlete.stvId}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
