import { useTranslation } from 'react-i18next';
import { StubPage } from '~/components/StubPage';

export default function DivisionGrading() {
  const { t } = useTranslation('judging');
  return <StubPage title={t('gradingTitle')} />;
}
