import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { Button } from '~/components/ui/button';
import { FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { DEFAULT_HONOUR_PERCENT, type EgtConfig } from '~/modules/egt/module';
import type { Sex } from '~/modules/types';
import { getCategories, setAllHonour } from './egtConfig';

type HonourPercent = EgtConfig['honourPercent'];

const PERCENT_INPUT = {
  type: 'number',
  inputMode: 'decimal',
  min: 0,
  max: 100,
  step: 'any',
} as const;

/** The percentage per category. Empty inputs are NaN, so they cannot be saved. */
export function HonourPercentFields({
  sexes,
  value,
  onChange,
  disabled,
}: {
  sexes: readonly Sex[];
  value: HonourPercent;
  onChange: (value: HonourPercent) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const [all, setAll] = useState(String(DEFAULT_HONOUR_PERCENT));
  const allId = useId();
  const allPercent = all === '' ? NaN : Number(all);

  return (
    <div className="grid gap-5">
      {!disabled && (
        <div className="grid gap-2">
          <FieldLabel htmlFor={allId}>{t('honour.all')}</FieldLabel>
          <div className="flex gap-2">
            <Input
              {...PERCENT_INPUT}
              id={allId}
              value={all}
              className="max-w-24"
              onChange={(event) => setAll(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (allPercent >= 0 && allPercent <= 100) onChange(setAllHonour(allPercent));
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!(allPercent >= 0 && allPercent <= 100)}
              onClick={() => onChange(setAllHonour(allPercent))}
            >
              {t('honour.apply')}
            </Button>
          </div>
        </div>
      )}
      {sexes.map((sex) => (
        <fieldset key={sex} disabled={disabled}>
          <legend className="mb-2 font-semibold">{t(`common:sex.${sex}`)}</legend>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-8 [&_label]:font-normal [&_label]:text-muted-foreground">
            {getCategories(sex).map((category) => {
              const percent = value[sex][category] ?? DEFAULT_HONOUR_PERCENT;
              return (
                <FormField
                  key={category}
                  label={
                    <>
                      {category}
                      <span className="sr-only">{t(`common:sex.${sex}`)}</span>
                      <span>%</span>
                    </>
                  }
                  {...PERCENT_INPUT}
                  // Without arrows, the column is too narrow for them.
                  className="[appearance:textfield] px-2 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
                  required
                  value={Number.isNaN(percent) ? '' : percent}
                  onChange={({ target }) =>
                    onChange({
                      ...value,
                      [sex]: { ...value[sex], [category]: target.valueAsNumber },
                    })
                  }
                />
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
