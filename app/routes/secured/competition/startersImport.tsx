import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function StartersImport() {
  const { t } = useTranslation('starters');
  return <StubPage title={t('importTitle')} />;
}
