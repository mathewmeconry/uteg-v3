import { useTranslation } from 'react-i18next';
import { draftKey, wasSent, type Draft } from '~/components/grading/draftStore';
import { Warning } from '~/components/grading/SaveState';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Button } from '~/components/ui/button';
import { evaluateFields, formatEntered } from '~/lib/domain/gradeInput';
import type { TabletSlot } from './types';

/** Every grade this tablet still has to save, also of starters it no longer lists. */
export function UnsavedGrades({
  items,
  slots,
  drafts,
  onOpen,
}: {
  items: readonly Draft[];
  /** Of all rounds. */
  slots: readonly TabletSlot[];
  drafts: GradeDrafts;
  onOpen: (slot: TabletSlot) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  if (items.length === 0) return null;

  function discard(draft: Draft) {
    const text = t(wasSent(draft) ? 'discardSent' : 'discardConfirm', { name: draft.name });
    if (window.confirm(text)) drafts.discard(draftKey(draft));
  }

  return (
    <Warning title={t('unsavedTitle', { count: items.length })}>
      <p>{t('unsavedText')}</p>
      <ul className="grid grid-cols-1 gap-2">
        {items.map((draft) => {
          const key = draftKey(draft);
          const { grade } = evaluateFields(draft.fields, draft.inputRule);
          const slot = slots.find((item) => draftKey(item) === key);
          const state = slot && drafts.get(slot);
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">
                {draft.name}:{' '}
                <span className="tabular-nums">
                  {grade ? formatEntered(grade.value) : t('save.unfinished')}
                </span>
              </span>
              <span className="flex-1 basis-40 text-sm text-muted-foreground">
                {state?.isConflict
                  ? state.saved
                    ? t('save.conflictSaved', { saved: formatEntered(state.saved.value) })
                    : t('save.conflictGone')
                  : draft.saving
                    ? t('save.saving')
                    : draft.queued
                      ? t('save.waiting')
                      : draft.rejected === 'ENTRY_NOT_JUDGEABLE'
                        ? t('save.stoppedText')
                        : draft.rejected
                          ? t(`common:domainErrors.${draft.rejected}`)
                          : t('save.unsaved')}
              </span>
              {state?.isConflict ? (
                <>
                  <Button variant="outline" onClick={() => drafts.discard(key)}>
                    {t('save.useSaved')}
                  </Button>
                  <Button disabled={!grade} onClick={() => void drafts.overwrite(key, state.saved)}>
                    {t('save.useOwn')}
                  </Button>
                </>
              ) : (
                <>
                  {slot && !slot.withdrawn && (
                    <Button variant="outline" onClick={() => onOpen(slot)}>
                      {t('common:actions.open')}
                    </Button>
                  )}
                  <Button variant="ghost" disabled={draft.saving} onClick={() => discard(draft)}>
                    {t('discard')}
                  </Button>
                </>
              )}
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
