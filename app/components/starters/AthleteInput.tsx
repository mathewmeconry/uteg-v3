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
  onChange,
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
  const [marked, setMarked] = useState<{ list: AthleteSuggestion[]; index: number }>();
  const suggestions = offered ?? [];
  // Enter must not pick somebody at the same place of another list.
  const activeIndex = marked && marked.list === offered ? marked.index : -1;
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
      setMarked({ list: suggestions, index: ((activeIndex + 1 + step + count) % count) - 1 });
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
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
            onChange={(event) => {
              setMarked(undefined);
              onChange?.(event);
            }}
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
