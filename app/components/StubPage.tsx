import { useTranslation } from 'react-i18next';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

/** Placeholder of a page that is not built yet. */
export function StubPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <>
      <title>{`${title} · UTEG`}</title>
      <PageHeader title={title} />
      <EmptyState title={t('notAvailableYet')} />
    </>
  );
}
