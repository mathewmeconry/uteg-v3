import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '~/components/FormField';
import type { ContestOptions, DivisionOption } from '~/lib/contestOptions.server';
import type { EgtApparatus } from '~/modules/egt/module';
import type { Sex } from '~/modules/types';
import { NativeSelect } from './NativeSelect';

export type EntryValue = { category: string; divisionId: string; startApparatus: string };

/** The divisions a starter of this category and sex can be assigned to. */
export function fittingDivisions(
  { divisions }: ContestOptions,
  { category, sex }: { category: string; sex: Sex | '' },
) {
  return divisions.filter((division) => division.category === category && division.sex === sex);
}

/** Category, division and start apparatus. Choices that do not fit any more become empty. */
export function EntryFields({
  options,
  sex,
  defaultValue,
}: {
  options: ContestOptions;
  sex: Sex | '';
  defaultValue: EntryValue;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const [value, setValue] = useState(defaultValue);

  const categories = sex ? options.categories[sex] : [];
  const category = categories.includes(value.category) ? value.category : '';
  const divisions = fittingDivisions(options, { category, sex });
  const division = divisions.find(({ id }) => id === value.divisionId);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <FormField label={t('common:fields.category')}>
        {(props) => (
          <NativeSelect
            {...props}
            name="category"
            value={category}
            onChange={(event) => setValue({ ...value, category: event.target.value })}
          >
            <option value="">{t('noCategory')}</option>
            {categories.map((key) => (
              <option key={key}>{key}</option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label={t('division')}>
        {(props) => (
          <NativeSelect
            {...props}
            name="divisionId"
            value={division?.id ?? ''}
            disabled={divisions.length === 0}
            onChange={(event) =>
              setValue({ ...value, category, divisionId: event.target.value, startApparatus: '' })
            }
          >
            <option value="">{t('noDivision')}</option>
            <DivisionOptions divisions={divisions} />
          </NativeSelect>
        )}
      </FormField>
      <FormField label={t('common:fields.startApparatus')}>
        {(props) => (
          <NativeSelect
            {...props}
            name="startApparatus"
            value={division?.apparatus.includes(value.startApparatus) ? value.startApparatus : ''}
            disabled={!division}
            onChange={(event) =>
              setValue({ ...value, category, startApparatus: event.target.value })
            }
          >
            <option value="">{t('noApparatus')}</option>
            <ApparatusOptions division={division} />
          </NativeSelect>
        )}
      </FormField>
    </div>
  );
}

export function DivisionOptions({ divisions }: { divisions: DivisionOption[] }) {
  const { t } = useTranslation('starters');
  return divisions.map(({ id, number }) => (
    <option key={id} value={id}>
      {t('divisionNumber', { number })}
    </option>
  ));
}

export function ApparatusOptions({ division }: { division: DivisionOption | undefined }) {
  const { t } = useTranslation();
  return division?.apparatus.map((apparatus) => (
    <option key={apparatus} value={apparatus}>
      {t(`apparatus.${apparatus as EgtApparatus}`)}
    </option>
  ));
}
