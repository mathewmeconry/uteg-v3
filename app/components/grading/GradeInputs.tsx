import { useId, useRef, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '~/components/ui/input';
import { formatEntered, type EvaluatedFields, type GradeFields } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import type { InputRule } from '~/modules/types';

/**
 * The fields of one grade: the final grade, or attempts with the final grade computed from them.
 * Enter moves through the attempts and then submits.
 */
export function GradeInputs({
  fields,
  evaluated,
  rule,
  name,
  large = false,
  compact = false,
  showRequired = false,
  disabled = false,
  firstInput,
  onChange,
  onSubmit,
}: {
  fields: GradeFields;
  evaluated: EvaluatedFields;
  rule: InputRule;
  /** Whose grade it is. Labels are only visible in the large version. */
  name: string;
  large?: boolean;
  /** In a table with a column per apparatus. */
  compact?: boolean;
  /** Missing values are only errors after trying to save. */
  showRequired?: boolean;
  disabled?: boolean;
  firstInput?: RefObject<HTMLInputElement | null>;
  onChange: (fields: GradeFields) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation('judging');
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const count = fields.attempts.length;
  const isDirect = fields.final.trim() !== '';

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputs = container.current?.querySelectorAll('input');
    const isLast = index >= count - 1;
    if (isLast || evaluated.errors.attempts[index]) onSubmit();
    else inputs?.[index + 1]?.focus();
  }

  const finalLabel =
    count === 0
      ? t('input.grade')
      : evaluated.usesAttempts
        ? t(`input.finalComputed.${rule.aggregation}`)
        : t('input.final');
  const computed = evaluated.grade ? formatEntered(evaluated.grade.value) : '';

  const controls = [
    ...fields.attempts.map((value, index) => ({
      key: `attempt${index}`,
      label: t('input.attempt', { number: index + 1 }),
      value,
      error: evaluated.errors.attempts[index],
      readOnly: false,
      disabled: isDirect && !evaluated.usesAttempts,
      onChange: (next: string) =>
        onChange({ ...fields, attempts: fields.attempts.with(index, next) }),
      index,
    })),
    {
      key: 'final',
      label: finalLabel,
      value: evaluated.usesAttempts ? computed : fields.final,
      error: evaluated.isEmpty && count === 0 ? ('REQUIRED' as const) : evaluated.errors.final,
      readOnly: evaluated.usesAttempts,
      disabled: false,
      onChange: (next: string) => onChange({ ...fields, final: next }),
      index: count,
    },
  ];
  const emptyError = count > 0 && evaluated.isEmpty && showRequired;

  function shownError<Error>(error: Error) {
    return error === 'REQUIRED' && !showRequired ? null : error;
  }
  const lineId = `${id}-errors`;
  const errors = new Set(controls.map(({ error }) => shownError(error)).filter((error) => !!error));
  if (emptyError) errors.add('REQUIRED');

  return (
    <div
      ref={container}
      className={cn(
        'flex flex-wrap items-start',
        large ? 'gap-4' : compact ? 'gap-1' : 'gap-2',
        // Attempts and the final grade stay next to each other, errors go below.
        compact && count > 0 && 'w-57',
      )}
    >
      {controls.map((control, position) => {
        const error = shownError(control.error);
        const errorId = large ? lineId : `${id}-${control.key}-error`;
        return (
          <div
            key={control.key}
            className={cn(
              'grid content-start gap-1.5',
              large && (control.key === 'final' ? 'basis-full' : 'flex-1 basis-32'),
            )}
          >
            <label
              htmlFor={`${id}-${control.key}`}
              className={cn(large ? 'text-lg font-medium' : 'sr-only')}
            >
              {control.label}
              {!large && ` ${name}`}
            </label>
            <Input
              ref={position === 0 ? firstInput : undefined}
              id={`${id}-${control.key}`}
              type="text"
              inputMode="decimal"
              enterKeyHint={control.index < count - 1 ? 'next' : 'send'}
              autoComplete="off"
              value={control.value}
              placeholder={
                large
                  ? undefined
                  : compact
                    ? control.index < count
                      ? `${control.index + 1}.`
                      : count > 0
                        ? t('input.grade')
                        : undefined
                    : control.label
              }
              readOnly={control.readOnly}
              tabIndex={control.readOnly ? -1 : undefined}
              disabled={disabled || control.disabled}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                'tabular-nums',
                large
                  ? 'h-20 px-0 text-center text-5xl font-bold md:text-5xl'
                  : cn('h-9 text-right text-base md:text-base', compact ? 'w-18 px-2' : 'w-24'),
                control.readOnly && 'bg-muted font-bold',
              )}
              onChange={(event) => control.onChange(event.target.value)}
              onKeyDown={(event) => onKeyDown(event, control.index)}
            />
            {!large && error && (
              <p
                id={errorId}
                className={cn('text-xs font-medium text-destructive', compact ? 'w-18' : 'w-24')}
              >
                {t(`input.errors.${error}`)}
              </p>
            )}
          </div>
        );
      })}
      {large && (
        // Always there, so that nothing below moves.
        <p
          id={lineId}
          role={emptyError ? 'alert' : undefined}
          className={cn(
            'min-h-7 basis-full',
            errors.size > 0 ? 'text-lg font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {errors.size > 0
            ? [...errors].map((error) => t(`input.errors.${error}`)).join(' ')
            : count > 0 && t('input.directHint')}
        </p>
      )}
      {!large && emptyError && (
        <p className="w-full text-xs font-medium text-destructive">{t('input.errors.REQUIRED')}</p>
      )}
    </div>
  );
}
