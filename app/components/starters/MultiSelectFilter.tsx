import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { cn } from '~/lib/utils';
import { commandFilter } from './starterList';

const SEARCH_FROM = 8;

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const { t } = useTranslation(['starters', 'common']);

  function toggle(value: string) {
    onChange(
      selected.includes(value) ? selected.filter((other) => other !== value) : [...selected, value],
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={
            selected.length > 0
              ? t('filterActive', { label, count: selected.length })
              : t('filterBy', { label })
          }
          className={cn('pointer-coarse:min-h-11', selected.length > 0 && 'border-primary')}
        >
          {label}
          {selected.length > 0 && <Badge>{selected.length}</Badge>}
          <ChevronDownIcon aria-hidden className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" aria-label={label}>
        <Command filter={commandFilter} label={t('filterBy', { label })}>
          {options.length >= SEARCH_FROM && (
            <CommandInput placeholder={t('common:actions.search')} />
          )}
          <CommandList label={label} aria-multiselectable>
            <CommandEmpty>{t('common:noResults')}</CommandEmpty>
            <CommandGroup>
              {options.map(({ value, label: optionLabel }) => {
                const isSelected = selected.includes(value);
                return (
                  <CommandItem
                    key={value}
                    // Not empty for "none".
                    value={`value-${value}`}
                    keywords={[optionLabel]}
                    onSelect={() => toggle(value)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input',
                        isSelected && 'border-primary bg-primary',
                      )}
                    >
                      {isSelected && <CheckIcon className="size-3.5 text-primary-foreground" />}
                    </span>
                    <span className="min-w-0 truncate">{optionLabel}</span>
                    {isSelected && <span className="sr-only">({t('common:yes')})</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
