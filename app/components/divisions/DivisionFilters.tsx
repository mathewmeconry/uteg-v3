import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
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

  return (
    <div
      role="group"
      aria-label={t('filters.label')}
      className="mb-4 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 xl:grid-cols-6"
    >
      <div className="grid min-w-0 gap-1">
        <span aria-hidden className="text-xs text-muted-foreground">
          {t('filters.search')}
        </span>
        <Input
          type="search"
          aria-label={t('filters.search')}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="bg-card"
        />
      </div>
      {filters.map(({ key, label, options }) => (
        <FilterSelect
          key={key}
          label={label}
          value={params.get(key) ?? ALL}
          options={[[ALL, t('filters.all')], ...options]}
          onChange={(value) => set(key, value)}
        />
      ))}
      <FilterSelect
        label={t('filters.sort')}
        value={params.get('sort') ?? SORT_KEYS[0]}
        options={SORT_KEYS.map((key) => [key, t(`filters.sortKeys.${key}`)])}
        onChange={(value) => set('sort', value)}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <span aria-hidden className="text-xs text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
