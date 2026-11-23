import { useTranslation } from 'react-i18next';
import { draftKey, type Draft } from '~/components/grading/draftStore';
import { Warning } from '~/components/grading/SaveState';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Button } from '~/components/ui/button';
import { evaluateFields, formatEntered } from '~/lib/domain/gradeInput';

/** Every grade this tablet still has to save, also of starters it no longer lists. */
export function UnsavedGrades({
  items,
  drafts,
  onOpen,
}: {
  items: readonly Draft[];
  drafts: GradeDrafts;
  /** Null for starters that cannot be opened now. */
  onOpen: (draft: Draft) => (() => void) | null;
}) {
  const { t } = useTranslation(['judging', 'common']);
  if (items.length === 0) return null;

  return (
    <Warning title={t('unsavedTitle', { count: items.length })}>
      <p>{t('unsavedText')}</p>
      <ul className="grid gap-2">
        {items.map((draft) => {
          const { grade } = evaluateFields(draft.fields, draft.inputRule);
          const open = onOpen(draft);
          return (
            <li key={draftKey(draft)} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">
                {draft.name}:{' '}
                <span className="tabular-nums">
                  {grade ? formatEntered(grade.value) : t('save.unfinished')}
                </span>
              </span>
              <span className="flex-1 text-sm text-muted-foreground">
                {draft.saving
                  ? t('save.saving')
                  : draft.queued
                    ? t('save.waiting')
                    : draft.rejected === 'ENTRY_NOT_JUDGEABLE'
                      ? t('save.stoppedText')
                      : draft.rejected
                        ? t(`common:domainErrors.${draft.rejected}`)
                        : t('save.unsaved')}
              </span>
              {open && (
                <Button variant="outline" onClick={open}>
                  {t('common:actions.open')}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={draft.saving}
                onClick={() => {
                  if (window.confirm(t('discardConfirm', { name: draft.name }))) {
                    drafts.discard(draftKey(draft));
                  }
                }}
              >
                {t('discard')}
              </Button>
            </li>
          );
        })}
      </ul>
      {items.some(({ queued, saving }) => queued && !saving) && (
        <div>
          <Button onClick={drafts.retry}>{t('save.retry')}</Button>
        </div>
      )}
    </Warning>
  );
}
