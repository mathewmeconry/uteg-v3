import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import { Button } from '~/components/ui/button';
import { FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { DEFAULT_HONOUR_PERCENT, type EgtConfig } from '~/modules/egt/module';
import { getCategories, setAllHonour, SEXES } from './egtConfig';

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
  value,
  onChange,
  disabled,
}: {
  value: HonourPercent;
  onChange: (value: HonourPercent) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const [all, setAll] = useState(String(DEFAULT_HONOUR_PERCENT));
  const allId = useId();
  const allPercent = all === '' ? NaN : Number(all);

  return (
    <div className="grid gap-6">
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
      {SEXES.map((sex) => (
        <fieldset key={sex} disabled={disabled}>
          <legend className="mb-3 font-medium">{t(`common:sex.${sex}`)}</legend>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {getCategories(sex).map((category) => {
              const percent = value[sex][category] ?? DEFAULT_HONOUR_PERCENT;
              return (
                <FormField
                  key={category}
                  label={
                    <>
                      {category}
                      <span className="sr-only">{t(`common:sex.${sex}`)}</span>
                      <span className="font-normal text-muted-foreground">%</span>
                    </>
                  }
                  {...PERCENT_INPUT}
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
