import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function Templates() {
  const { t } = useTranslation('pdf');
  return <StubPage title={t('templatesTitle')} />;
}
