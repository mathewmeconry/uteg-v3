import { useTranslation } from 'react-i18next';
import { SaveStatus } from '~/components/SaveStatus';
import { isUntouched, type GradeDrafts } from './useGradeDrafts';

/** What happened to the grades of the whole page. The rows tell it for each of them. */
export function GradingSaveStatus({ drafts }: { drafts: GradeDrafts }) {
  const { t } = useTranslation('judging');
  const open = [...drafts.drafts.values()].filter((draft) => !isUntouched(draft));
  const isSaving = open.some(({ saving }) => saving);
  const failed = open.filter(({ queued, saving, rejected }) => (queued && !saving) || rejected);

  function getState() {
    if (isSaving) return 'saving';
    if (failed.length > 0) return 'error';
    return drafts.hasSaved && open.length === 0 ? 'saved' : 'idle';
  }

  return (
    <SaveStatus
      state={getState()}
      message={t('unsavedTitle', { count: failed.length })}
      onRetry={failed.some(({ queued }) => queued) ? drafts.retry : undefined}
    />
  );
}
