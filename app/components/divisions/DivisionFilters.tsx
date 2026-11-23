import { ListFilterIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { cn } from '~/lib/utils';
import { SORT_KEYS, type Division } from './divisionList';

// Radix does not allow empty values.
const ALL = 'all';

export function DivisionFilters({
  divisions,
  grounds,
  search,
  onSearch,
}: {
  divisions: Division[];
  grounds: number;
  search: string;
  onSearch: (search: string) => void;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const [params, setParams] = useSearchParams();
  // Only on phones, elsewhere they are always shown.
  const [isOpen, setIsOpen] = useState(false);

  function set(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === ALL) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  const categories = [...new Set(divisions.map(({ category }) => category))];
  const filters = [
    {
      key: 'category',
      label: t('common:fields.category'),
      options: categories.map((value) => [value, value]),
    },
    {
      key: 'sex',
      label: t('common:fields.sex'),
      options: (['FEMALE', 'MALE'] as const).map((value) => [value, t(`common:sex.${value}`)]),
    },
    {
      key: 'ground',
      label: t('common:fields.ground'),
      options: Array.from({ length: grounds }, (_, index) => [
        String(index + 1),
        t('common:ground', { number: index + 1 }),
      ]),
    },
    {
      key: 'state',
      label: t('common:fields.state'),
      options: (['PENDING', 'RUNNING', 'ENDED'] as const).map((value) => [
        value,
        t(`common:divisionState.${value}`),
      ]),
    },
  ];
  const activeCount = filters.filter(({ key }) => params.has(key)).length;

  return (
    <div
      role="group"
      aria-label={t('filters.label')}
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t('filters.search')}
          placeholder={t('filters.search')}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="pl-9"
        />
      </div>
      <Button
        variant="outline"
        className="sm:hidden"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <ListFilterIcon aria-hidden />
        {t('common:actions.filter')}
        {activeCount > 0 && <Badge>{activeCount}</Badge>}
      </Button>
      <div
        className={cn(
          'flex flex-wrap gap-2 max-sm:grid max-sm:w-full max-sm:grid-cols-1',
          !isOpen && 'max-sm:hidden',
        )}
      >
        {filters.map(({ key, label, options }) => (
          <FilterSelect
            key={key}
            label={label}
            value={params.get(key) ?? ALL}
            isActive={params.has(key)}
            options={[[ALL, t('filters.all')], ...options]}
            onChange={(value) => set(key, value)}
          />
        ))}
        <FilterSelect
          label={t('filters.sort')}
          value={params.get('sort') ?? SORT_KEYS[0]}
          isActive={false}
          options={SORT_KEYS.map((key) => [key, t(`filters.sortKeys.${key}`)])}
          onChange={(value) => set('sort', value)}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  isActive,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  isActive: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          'gap-1.5 max-sm:w-full',
          isActive ? 'border-primary bg-accent font-semibold' : undefined,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="font-normal text-muted-foreground">{label}:</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
