import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, SearchIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import type { EgtApparatus } from '~/modules/egt/module';
import { MultiSelectFilter } from './MultiSelectFilter';
import { NativeSelect } from './NativeSelect';
import {
  COLUMNS,
  FILTERS,
  filterValues,
  NO_FILTERS,
  type Column,
  type Filter,
  type Filters,
  type Sort,
} from './starterList';
import type { StarterRow } from './starterRow';
import { columnLabel } from './StartersTable';

/** Search, filters, sorting and columns. */
export function StartersToolbar({
  rows,
  apparatus,
  search,
  onSearch,
  filters,
  onFilters,
  sort,
  onSort,
  columns,
  onColumns,
}: {
  rows: StarterRow[];
  apparatus: readonly string[];
  search: string;
  onSearch: (search: string) => void;
  filters: Filters;
  onFilters: (filters: Filters) => void;
  sort: Sort;
  onSort: (sort: Sort) => void;
  columns: Column[];
  onColumns: (columns: Column[]) => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const isFiltered = search !== '' || FILTERS.some((key) => filters[key].length > 0);

  function optionLabel(key: Filter, value: string) {
    if (key === 'category') return value || t('noCategory');
    if (key === 'division') return value ? t('divisionNumber', { number: value }) : t('noDivision');
    if (key === 'sex') return t(`common:sex.${value as StarterRow['sex']}`);
    if (key === 'startApparatus') {
      return value ? t(`common:apparatus.${value as EgtApparatus}`) : t('noApparatus');
    }
    const club = rows.find((row) => row.club.id === value)?.club;
    return club ? `${club.name}, ${club.location}` : value;
  }

  return (
    <div className="@container mb-4 grid gap-2">
      <div className="relative max-w-xl">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('common:actions.search')}
          className="bg-card pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((key) => (
          <MultiSelectFilter
            key={key}
            label={columnLabel(t, key)}
            // A chosen value must stay visible after the last starter with it is gone.
            options={[...new Set([...filterValues(rows, key, apparatus), ...filters[key]])].map(
              (value) => ({ value, label: optionLabel(key, value) }),
            )}
            selected={filters[key]}
            onChange={(values) => onFilters({ ...filters, [key]: values })}
          />
        ))}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              onSearch('');
              onFilters(NO_FILTERS);
            }}
          >
            <XIcon aria-hidden />
            {t('resetFilters')}
          </Button>
        )}

        {/* Sorting happens in the header of the table, columns only exist there. */}
        <div className="flex w-full gap-2 @4xl:hidden">
          <NativeSelect
            aria-label={t('sortBy')}
            className="max-w-56"
            value={sort.column}
            onChange={(event) => onSort({ ...sort, column: event.target.value as Column })}
          >
            {COLUMNS.map((column) => (
              <option key={column} value={column}>
                {columnLabel(t, column)}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="icon"
            aria-label={sort.direction === 'asc' ? t('sortDescending') : t('sortAscending')}
            onClick={() =>
              onSort({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
            }
          >
            {sort.direction === 'asc' ? <ArrowDownIcon aria-hidden /> : <ArrowUpIcon aria-hidden />}
          </Button>
        </div>
        <div className="ml-auto hidden @4xl:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="pointer-coarse:min-h-11">
                <Columns3Icon aria-hidden />
                {t('columns')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {COLUMNS.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={columns.includes(column)}
                  // Without the name nobody knows who is meant.
                  disabled={column === 'lastname'}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(isVisible) =>
                    onColumns(
                      COLUMNS.filter((key) => (key === column ? isVisible : columns.includes(key))),
                    )
                  }
                >
                  {columnLabel(t, column)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
