import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Judges() {
  const { t } = useTranslation('judging');
  return <StubPage title={t('judgesTitle')} />;
}
