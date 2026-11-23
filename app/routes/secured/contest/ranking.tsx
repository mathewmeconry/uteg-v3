import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Ranking() {
  const { t } = useTranslation('ranking');
  return <StubPage title={t('title')} />;
}
