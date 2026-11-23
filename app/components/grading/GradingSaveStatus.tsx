import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SaveStatus } from '~/components/SaveStatus';
import type { GradeDrafts } from './useGradeDrafts';

/** What happened to the grades of the whole page. The rows tell it for each of them. */
export function GradingSaveStatus({ drafts }: { drafts: GradeDrafts }) {
  const { t } = useTranslation('judging');
  const open = [...drafts.drafts.values()].filter(({ confirmed }) => !confirmed);
  const isSaving = open.some(({ saving }) => saving);
  const failed = open.filter(({ saving, failed, rejected }) => !saving && (failed || rejected));

  const [hasSaved, setHasSaved] = useState(false);
  if (isSaving && !hasSaved) setHasSaved(true);

  return (
    <SaveStatus
      state={
        isSaving
          ? 'saving'
          : failed.length > 0
            ? 'error'
            : hasSaved && !open.length
              ? 'saved'
              : 'idle'
      }
      message={t('unsavedTitle', { count: failed.length })}
      onRetry={failed.some((draft) => draft.failed) ? drafts.retry : undefined}
    />
  );
}
