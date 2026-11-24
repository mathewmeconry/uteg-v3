import { useTranslation } from 'react-i18next';
import { categoryName } from '~/lib/categoryName';
import type { Division } from './divisionList';

/** Names a division in sentences and dialogs. */
export function useDivisionName() {
  const { t } = useTranslation(['divisions', 'common']);
  return ({ category, sex, number }: Pick<Division, 'category' | 'sex' | 'number'>) =>
    t('name', { category: categoryName(category, t), sex: t(`common:sex.${sex}`), number });
}
