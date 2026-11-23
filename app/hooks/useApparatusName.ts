import { useTranslation } from 'react-i18next';
import type { EgtApparatus } from '~/modules/egt/module';

/** Apparatus are stored as strings, because modules define their own. */
export function useApparatusName() {
  const { t } = useTranslation();
  return (apparatus: string) => t(`apparatus.${apparatus as EgtApparatus}`);
}
