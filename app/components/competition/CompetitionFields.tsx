import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateField } from '~/components/DateField';
import { FormField } from '~/components/FormField';
import { RadioChips } from '~/components/RadioChips';
import { FieldError } from '~/components/ui/field';
import { SEXES } from '~/modules/types';

type Errors = Record<string, string | undefined>;

/** Name, location and dates. */
export function CompetitionFields({
  errors,
  defaults,
}: {
  errors: Errors;
  defaults?: { name: string; location: string; startDate: Date; endDate: Date };
}) {
  const { t } = useTranslation(['competition', 'common']);
  const [start, setStart] = useState(toDay(defaults?.startDate));
  const [end, setEnd] = useState(toDay(defaults?.endDate));

  function changeStart(value: string) {
    setStart(value);
    // Most competitions take one day.
    if (!end || end === start) setEnd(value);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        label={t('common:fields.name')}
        error={errors.name}
        name="name"
        defaultValue={defaults?.name}
        maxLength={200}
        required
      />
      <FormField
        label={t('common:fields.location')}
        error={errors.location}
        name="location"
        defaultValue={defaults?.location}
        maxLength={200}
        required
      />
      <DateField
        label={t('fields.startDate')}
        error={errors.startDate}
        name="startDate"
        max="9999-12-31"
        value={start}
        onChange={(event) => changeStart(event.target.value)}
        required
      />
      <DateField
        label={t('fields.endDate')}
        error={errors.endDate}
        name="endDate"
        min={start}
        max="9999-12-31"
        value={end}
        onChange={(event) => setEnd(event.target.value)}
        required
      />
    </div>
  );
}

export function GroundsField({
  error,
  defaultValue = 1,
}: {
  error?: string;
  defaultValue?: number;
}) {
  const { t } = useTranslation('competition');
  return (
    <FormField
      label={t('fields.grounds')}
      hint={t('fields.groundsHint')}
      error={error}
      name="grounds"
      type="number"
      inputMode="numeric"
      min={1}
      max={20}
      defaultValue={defaultValue}
      className="max-w-32"
      required
    />
  );
}

const SEX_CHOICES = ['BOTH', ...SEXES] as const;
export type Sexes = (typeof SEX_CHOICES)[number];

/** Who takes part. */
export function SexesField({
  error,
  value,
  onChange,
}: {
  error?: string;
  value: Sexes;
  onChange: (value: Sexes) => void;
}) {
  const { t } = useTranslation('competition');
  return (
    <div className="grid gap-2">
      <RadioChips
        legend={t('fields.sexes')}
        name="sexes"
        value={value}
        options={SEX_CHOICES.map((choice) => ({
          value: choice,
          label: t(choice === 'BOTH' ? 'fields.sexesBoth' : `fields.sexes${choice}`),
        }))}
        onChange={onChange}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

/** Dates are plain days at midnight UTC. */
function toDay(date?: Date) {
  return date?.toISOString().slice(0, 10) ?? '';
}
