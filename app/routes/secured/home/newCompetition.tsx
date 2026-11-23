import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function NewCompetition() {
  const { t } = useTranslation('competition');
  return <StubPage title={t('new')} />;
}
