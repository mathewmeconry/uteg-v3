import type { TFunction } from 'i18next';

/** Categories are stored as K5, in French they are called C5. Takes the t() of any namespace. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function categoryName(category: string, t: TFunction<any>) {
  return category.replace(/^K(?=[1-7DH]$)/, t('common:categoryPrefix'));
}
