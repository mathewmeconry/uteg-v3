import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Settings() {
  const { t } = useTranslation('settings');
  return <StubPage title={t('title')} />;
}
