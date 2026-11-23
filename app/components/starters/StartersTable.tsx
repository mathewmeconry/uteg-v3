import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  PencilIcon,
  Trash2Icon,
  UserRoundPenIcon,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';
import type { EgtApparatus } from '~/modules/egt/module';
import { columnText, type Column, type Sort } from './starterList';
import { fullName, type StarterRow } from './starterRow';

// Rendering everyone at once would make opening and searching slow.
const CHUNK = 60;

type RowProps = {
  row: StarterRow;
  columns: Column[];
  canEdit: boolean;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onEdit: (row: StarterRow) => void;
  onRemove: (row: StarterRow) => void;
};

/** A table, or cards when there is no room for it. More rows follow while scrolling. */
export function StartersTable({
  rows,
  columns,
  sort,
  onSort,
  selected,
  onToggleAll,
  ...rowProps
}: {
  rows: StarterRow[];
  sort: Sort;
  onSort: (column: Column) => void;
  selected: ReadonlySet<string>;
  onToggleAll: () => void;
} & Omit<RowProps, 'row' | 'isSelected'>) {
  const { t } = useTranslation(['starters', 'common']);
  const [limit, setLimit] = useState(CHUNK);
  const shown = rows.slice(0, limit);
  const { canEdit } = rowProps;
  const selectedCount = rows.filter(({ id }) => selected.has(id)).length;
  const props = (row: StarterRow) => ({
    ...rowProps,
    key: row.id,
    row,
    columns,
    isSelected: selected.has(row.id),
  });

  return (
    <div className="@container">
      <div className="hidden overflow-hidden rounded-xl border bg-card @4xl:block">
        <Table aria-rowcount={rows.length + 1}>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-11 p-0">
                  <SelectAll
                    count={rows.length}
                    selectedCount={selectedCount}
                    onToggle={onToggleAll}
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <SortableHead
                  key={column}
                  label={columnLabel(t, column)}
                  direction={sort.column === column ? sort.direction : undefined}
                  onSort={() => onSort(column)}
                />
              ))}
              {canEdit && (
                <TableHead>
                  <span className="sr-only">{t('actions')}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => {
              const { key, ...rest } = props(row);
              return <StarterTableRow key={key} {...rest} />;
            })}
          </TableBody>
        </Table>
      </div>

      <div className="@4xl:hidden">
        {canEdit && (
          <div className="flex items-center text-sm">
            <SelectAll count={rows.length} selectedCount={selectedCount} onToggle={onToggleAll} />
            <span aria-hidden>{t('selectAllFiltered', { count: rows.length })}</span>
          </div>
        )}
        <ul className="grid gap-px overflow-hidden rounded-xl border bg-border @2xl:grid-cols-2 @2xl:odd:*:last:col-span-2">
          {shown.map((row) => {
            const { key, ...rest } = props(row);
            return <StarterCard key={key} {...rest} />;
          })}
        </ul>
      </div>

      {limit < rows.length && (
        <ShowMore key={limit} onVisible={() => setLimit((previous) => previous + CHUNK)} />
      )}
    </div>
  );
}

const StarterTableRow = memo(function StarterTableRow({
  row,
  columns,
  canEdit,
  isSelected,
  onToggle,
  onEdit,
  onRemove,
}: RowProps) {
  const { t } = useTranslation(['starters', 'common']);

  return (
    <TableRow
      data-state={isSelected ? 'selected' : undefined}
      className={canEdit ? 'cursor-pointer data-[state=selected]:bg-accent' : undefined}
      // A shortcut for the mouse, the pencil does the same.
      onClick={({ target }) => {
        if (!canEdit || (target as Element).closest('a, button, input, label')) return;
        if (!window.getSelection()?.toString()) onEdit(row);
      }}
    >
      {canEdit && (
        <TableCell className="p-0">
          <SelectBox row={row} isSelected={isSelected} onToggle={onToggle} />
        </TableCell>
      )}
      {columns.map((column, index) => (
        <TableCell
          key={column}
          className={cn(
            'py-1',
            (column === 'club' || column === 'location') && 'max-w-52 truncate',
            (column === 'lastname' || column === 'firstname') && 'font-semibold',
          )}
        >
          {column === 'sex'
            ? t(`common:sex.${row.sex}`)
            : column === 'startApparatus' && row.startApparatus
              ? t(`common:apparatus.${row.startApparatus as EgtApparatus}`)
              : columnText(row, column)}
          {index === 0 && row.differs && <DiffersMark />}
        </TableCell>
      ))}
      {canEdit && (
        <TableCell className="p-0 text-right">
          <RowActions row={row} onEdit={onEdit} onRemove={onRemove} />
        </TableCell>
      )}
    </TableRow>
  );
});

const StarterCard = memo(function StarterCard({
  row,
  canEdit,
  isSelected,
  onToggle,
  onEdit,
  onRemove,
}: RowProps) {
  const { t } = useTranslation(['starters', 'common']);
  const entry = [
    row.category ?? t('noCategory'),
    row.divisionNumber && t('divisionNumber', { number: row.divisionNumber }),
    row.startApparatus && t(`common:apparatus.${row.startApparatus as EgtApparatus}`),
  ];

  return (
    <li
      data-state={isSelected ? 'selected' : undefined}
      className="flex items-start bg-card data-[state=selected]:bg-accent"
    >
      {canEdit && <SelectBox row={row} isSelected={isSelected} onToggle={onToggle} />}
      <div className={cn('min-w-0 flex-1 py-2 text-sm', !canEdit && 'pl-4')}>
        <p className="text-base leading-snug font-semibold">
          {fullName(row)}
          {row.differs && <DiffersMark />}
        </p>
        <p>{entry.filter(Boolean).join(', ')}</p>
        <p className="text-muted-foreground">
          {row.club.name}, {row.birthYear}, {t(`common:sex.${row.sex}`)}
        </p>
      </div>
      {canEdit && <RowActions row={row} onEdit={onEdit} onRemove={onRemove} />}
    </li>
  );
});

function SelectAll({
  count,
  selectedCount,
  onToggle,
}: {
  count: number;
  selectedCount: number;
  onToggle: () => void;
}) {
  const { t } = useTranslation('starters');
  return (
    <label className="flex size-11 items-center justify-center">
      <input
        type="checkbox"
        // There is no attribute for it.
        ref={(input) => {
          if (input) input.indeterminate = selectedCount > 0 && selectedCount < count;
        }}
        checked={selectedCount === count}
        onChange={onToggle}
        aria-label={t('selectAllFiltered', { count })}
        className="size-4.5 accent-primary"
      />
    </label>
  );
}

function SelectBox({
  row,
  isSelected,
  onToggle,
}: Pick<RowProps, 'row' | 'isSelected' | 'onToggle'>) {
  const { t } = useTranslation('starters');
  return (
    // A finger needs more than the box. The browser's checkbox keeps hundreds of rows fast.
    <label className="flex size-11 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(row.id)}
        aria-label={t('selectRow', { name: fullName(row) })}
        className="size-4.5 accent-primary"
      />
    </label>
  );
}

/** Not rendered again when the selection changes. */
const RowActions = memo(function RowActions({
  row,
  onEdit,
  onRemove,
}: Pick<RowProps, 'row' | 'onEdit' | 'onRemove'>) {
  const { t } = useTranslation('starters');
  const name = fullName(row);
  return (
    <span className="inline-flex shrink-0 text-muted-foreground">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('editRow', { name })}
        onClick={() => onEdit(row)}
      >
        <PencilIcon aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('removeRow', { name })}
        onClick={() => onRemove(row)}
      >
        <Trash2Icon aria-hidden />
      </Button>
    </span>
  );
});

function DiffersMark() {
  const { t } = useTranslation('starters');
  return (
    <span title={t('differs')} className="ml-1.5 inline-flex align-text-bottom">
      <UserRoundPenIcon aria-hidden className="size-4 text-primary" />
      <span className="sr-only">{t('differs')}</span>
    </span>
  );
}

function SortableHead({
  label,
  direction,
  onSort,
}: {
  label: string;
  direction: Sort['direction'] | undefined;
  onSort: () => void;
}) {
  const Icon = !direction ? ChevronsUpDownIcon : direction === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead
      aria-sort={!direction ? 'none' : direction === 'asc' ? 'ascending' : 'descending'}
      className="px-0"
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn('gap-1 text-xs has-[>svg]:px-3', direction && 'text-foreground')}
        onClick={onSort}
      >
        {label}
        <Icon aria-hidden className={cn('size-3.5', !direction && 'opacity-40')} />
      </Button>
    </TableHead>
  );
}

function ShowMore({ onVisible }: { onVisible: () => void }) {
  const { t } = useTranslation('starters');
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible();
      },
      { rootMargin: '600px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted again for every chunk
  }, []);

  return (
    <div className="p-4 text-center">
      <Button ref={ref} variant="outline" onClick={onVisible}>
        {t('showMore')}
      </Button>
    </div>
  );
}

/** Column titles are shared with the toolbar. */
export function columnLabel(
  t: ReturnType<typeof useTranslation<['starters', 'common']>>['t'],
  column: Column,
) {
  return column === 'division' ? t('division') : t(`common:fields.${column}`);
}
