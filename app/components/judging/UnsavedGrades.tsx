import { ChevronDownIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { draftKey, type Draft, type GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Button } from '~/components/ui/button';
import { evaluateFields, formatEntered } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import type { TabletSlot } from './types';

/**
 * Every grade this tablet still has to save, also of starters it no longer lists. One line, so the
 * form below stays on the screen, until it is opened or there is a conflict.
 */
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
  const [isOpenChosen, setIsOpen] = useState<boolean>();
  const listId = useId();
  // Someone has to decide about a conflict.
  const isOpen =
    isOpenChosen ??
    items.some((draft) => {
      const slot = slots.find((item) => draftKey(item) === draftKey(draft));
      return slot !== undefined && drafts.get(slot).isConflict;
    });

  function discard(draft: Draft) {
    const text = t(draft.sent ? 'discardSent' : 'discardConfirm', { name: draft.name });
    if (window.confirm(text)) drafts.discard(draftKey(draft));
  }

  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-destructive bg-card wrap-anywhere [&_button]:h-auto [&_button]:whitespace-normal"
    >
      <div className="flex items-center gap-2 pl-4">
        <TriangleAlertIcon aria-hidden className="size-5 shrink-0 text-destructive" />
        <p className="min-w-0 flex-1 text-lg leading-tight font-bold text-destructive">
          {t('unsavedTitle', { count: items.length })}
        </p>
        <Button
          variant="ghost"
          className="text-lg"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          onClick={() => setIsOpen(!isOpen)}
        >
          {t(isOpen ? 'unsavedHide' : 'unsavedShow')}
          <ChevronDownIcon aria-hidden className={cn('size-5', isOpen && 'rotate-180')} />
        </Button>
      </div>
      {isOpen && (
        <div id={listId} className="grid grid-cols-1 gap-2 border-t px-4 py-3">
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
                      <Button
                        disabled={!grade}
                        onClick={() => void drafts.overwrite(key, state.saved)}
                      >
                        {t('save.useOwn')}
                      </Button>
                    </>
                  ) : (
                    <>
                      {slot && !slot.withdrawn && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsOpen(undefined);
                            onOpen(slot);
                          }}
                        >
                          {t('common:actions.open')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        disabled={draft.saving}
                        onClick={() => discard(draft)}
                      >
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
        </div>
      )}
    </div>
  );
}
