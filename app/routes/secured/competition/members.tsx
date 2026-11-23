import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Members() {
  const { t } = useTranslation('settings');
  return <StubPage title={t('membersTitle')} />;
}
