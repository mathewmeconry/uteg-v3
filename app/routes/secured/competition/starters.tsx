import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Starters() {
  const { t } = useTranslation('starters');
  return <StubPage title={t('title')} />;
}
