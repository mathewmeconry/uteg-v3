import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Dashboard() {
  const { t } = useTranslation();
  return <StubPage title={t('nav.dashboard')} />;
}
