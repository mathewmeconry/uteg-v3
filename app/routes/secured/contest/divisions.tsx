import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Divisions() {
  const { t } = useTranslation('divisions');
  return <StubPage title={t('title')} />;
}
