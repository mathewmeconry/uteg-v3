import { ArrowLeftRightIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { memo, type Dispatch, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import type { ContestOptions } from '~/lib/contestOptions.server';
import {
  invalidFields,
  isDivisionUnknown,
  type ReviewAction,
  type ReviewField,
  type ReviewRow,
} from './importReview';
import { NativeSelect } from './NativeSelect';

const GRID =
  '@5xl:grid-cols-[2.5rem_6.5rem_minmax(0,1fr)_2.75rem_minmax(0,1fr)_5rem_7.5rem_6rem_6rem_2.75rem]';

/** Edits the rows before the import. One line per row, or cards when there is no room. */
export function ImportReview({
  rows,
  options,
  dispatch,
}: {
  rows: ReviewRow[];
  options: ContestOptions;
  dispatch: Dispatch<ReviewAction>;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const swapAll = (
    <Button type="button" variant="outline" onClick={() => dispatch({ type: 'swapAll' })}>
      <ArrowLeftRightIcon aria-hidden />
      {t('import.swapAll')}
    </Button>
  );

  return (
    <div className="@container grid gap-3">
      <div>{swapAll}</div>
      <div aria-hidden className={`hidden gap-2 px-2 text-sm font-medium @5xl:grid ${GRID}`}>
        <span />
        <span>{t('common:fields.stvId')}</span>
        <span>{t('common:fields.firstname')}</span>
        <span />
        <span>{t('common:fields.lastname')}</span>
        <span>{t('common:fields.birthYear')}</span>
        <span>{t('common:fields.sex')}</span>
        <span>{t('common:fields.category')}</span>
        <span>{t('division')}</span>
      </div>
      <ul className="grid gap-3 @5xl:gap-0 @5xl:divide-y @5xl:rounded-xl @5xl:border @5xl:bg-card">
        {rows.map((row, index) => (
          <Row key={row.key} row={row} number={index + 1} options={options} dispatch={dispatch} />
        ))}
      </ul>
    </div>
  );
}

const Row = memo(function Row({
  row,
  number,
  options,
  dispatch,
}: {
  row: ReviewRow;
  number: number;
  options: ContestOptions;
  dispatch: Dispatch<ReviewAction>;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const invalid = invalidFields(row, options);
  const isUnknown = isDivisionUnknown(row, options);
  const categories = row.sex ? options.categories[row.sex] : [];

  const control = (field: ReviewField, label: string) => ({
    value: row[field],
    'aria-label': t('import.field', { label, row: number }),
    'aria-invalid': invalid.includes(field),
    onChange: (event: { target: { value: string } }) =>
      dispatch({ type: 'change', key: row.key, field, value: event.target.value }),
  });

  return (
    <li
      className={`grid grid-cols-2 items-start gap-2 rounded-xl border bg-card p-3 @2xl:grid-cols-4 @5xl:rounded-none @5xl:border-0 @5xl:bg-transparent @5xl:p-2 ${GRID}`}
    >
      <span className="self-center font-medium text-muted-foreground @5xl:text-right @5xl:text-sm">
        <span className="@5xl:hidden">{t('import.row', { row: number })}</span>
        <span aria-hidden className="hidden @5xl:inline">
          {number}
        </span>
      </span>
      <Cell label={t('common:fields.stvId')}>
        <Input {...control('stvId', t('common:fields.stvId'))} maxLength={50} />
      </Cell>
      <Cell label={t('common:fields.firstname')}>
        <Input {...control('firstname', t('common:fields.firstname'))} maxLength={100} />
      </Cell>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="order-last w-full @5xl:order-none @5xl:w-auto"
        aria-label={t('import.swap', { row: number })}
        onClick={() => dispatch({ type: 'swap', key: row.key })}
      >
        <ArrowLeftRightIcon aria-hidden />
      </Button>
      <Cell label={t('common:fields.lastname')}>
        <Input {...control('lastname', t('common:fields.lastname'))} maxLength={100} />
      </Cell>
      <Cell label={t('common:fields.birthYear')}>
        <Input
          {...control('birthYear', t('common:fields.birthYear'))}
          inputMode="numeric"
          maxLength={4}
        />
      </Cell>
      <Cell label={t('common:fields.sex')}>
        <NativeSelect {...control('sex', t('common:fields.sex'))}>
          <option value="" disabled>
            {t('choose')}
          </option>
          <option value="FEMALE">{t('common:sex.FEMALE')}</option>
          <option value="MALE">{t('common:sex.MALE')}</option>
        </NativeSelect>
      </Cell>
      <Cell label={t('common:fields.category')}>
        <NativeSelect {...control('category', t('common:fields.category'))}>
          <option value="">–</option>
          {row.category && !categories.includes(row.category) && <option>{row.category}</option>}
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </NativeSelect>
      </Cell>
      <Cell label={t('division')}>
        <Input
          {...control('divisionNumber', t('division'))}
          inputMode="numeric"
          maxLength={4}
          aria-describedby={isUnknown ? `division-${row.key}` : undefined}
        />
      </Cell>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="order-last w-full @5xl:w-auto"
        aria-label={t('import.removeRow', { row: number })}
        onClick={() => dispatch({ type: 'remove', key: row.key })}
      >
        <Trash2Icon aria-hidden />
      </Button>
      {isUnknown && (
        <p
          id={`division-${row.key}`}
          className="col-span-full flex items-center gap-1.5 text-sm text-muted-foreground @5xl:order-last @5xl:justify-end"
        >
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-warning" />
          {t('import.divisionNotFound')}
        </p>
      )}
    </li>
  );
});

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      {/* The control carries a label with the row number. */}
      <span aria-hidden className="text-xs text-muted-foreground @5xl:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}
