import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Displays() {
  const { t } = useTranslation('display');
  return <StubPage title={t('title')} />;
}
