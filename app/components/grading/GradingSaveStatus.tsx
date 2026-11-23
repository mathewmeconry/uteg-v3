import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SaveStatus } from '~/components/SaveStatus';
import { isUntouched } from './draftStore';
import type { GradeDrafts } from './useGradeDrafts';

/** What happened to the grades of the whole page. The rows tell it for each of them. */
export function GradingSaveStatus({ drafts }: { drafts: GradeDrafts }) {
  const { t } = useTranslation('judging');
  const all = [...drafts.drafts.values()];
  const open = all.filter((draft) => !draft.confirmed && !isUntouched(draft));
  const isSaving = open.some(({ saving }) => saving);
  // What is being typed is not finished.
  const unsaved = open.filter(({ saving, typing, failed }) => !saving && (failed || !typing));

  const [hasSaved, setHasSaved] = useState(false);
  if (!hasSaved && all.some(({ confirmed, lastSaved }) => confirmed || lastSaved)) {
    setHasSaved(true);
  }

  return (
    <SaveStatus
      state={
        isSaving
          ? 'saving'
          : unsaved.length > 0
            ? 'error'
            : hasSaved && open.length === 0
              ? 'saved'
              : 'idle'
      }
      message={t('unsavedTitle', { count: unsaved.length })}
      onRetry={unsaved.some(({ queued }) => queued) ? drafts.retry : undefined}
    />
  );
}
