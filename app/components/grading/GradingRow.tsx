import { SaveIcon, Trash2Icon, UndoIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { fullName, type TabletSlot } from '~/components/judging/types';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useApparatusName } from '~/hooks/useApparatusName';
import { categoryName } from '~/lib/categoryName';
import { formatEntered } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import { GradeInputs } from './GradeInputs';
import { ConflictNotice, RejectedNotice, SaveState } from './SaveState';
import { draftKey, type GradeDrafts } from './useGradeDrafts';
import { findInput, useGradeEditing } from './useGradeEditing';

/** One starter in the grading tables of a ground. */
export function GradingRow({
  slot,
  position,
  drafts,
  canEdit,
}: {
  slot: TabletSlot;
  position: number;
  drafts: GradeDrafts;
  canEdit: boolean;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const apparatusName = useApparatusName();
  const [isActive, setIsActive] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const { state, undo, showRequired, change, goToNext, handlers } = useGradeEditing({
    slot,
    drafts,
    element: row,
    findNext,
    onActiveChange: setIsActive,
  });
  /** The grade in the open delete dialog, also when another one is saved meanwhile. */
  const [shown, setShown] = useState(state.saved);
  const key = draftKey(slot);
  const name = fullName(slot);
  const isEditable = canEdit && !slot.withdrawn;

  function findNext() {
    let next = row.current?.nextElementSibling;
    while (next && !findInput(next)) next = next.nextElementSibling;
    return findInput(next);
  }

  return (
    // Only passes on what happens in the fields.
    <li
      ref={row}
      {...handlers}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2',
        state.isDirty && 'bg-warning/15',
      )}
    >
      <span className="w-6 text-right text-muted-foreground tabular-nums">{position}.</span>
      <span className={cn('min-w-40 flex-1', slot.withdrawn && 'line-through')}>
        <span className="block font-medium">{name}</span>
        <span className="block text-sm text-muted-foreground">
          {slot.clubName} · {categoryName(slot.category, t)} {t(`sexShort.${slot.sex}`)}
        </span>
      </span>
      {slot.withdrawn && <Badge variant="outline">{t('withdrawn')}</Badge>}
      {!isEditable && (
        <span className="text-lg font-bold tabular-nums">
          {state.saved ? formatEntered(state.saved.value) : '–'}
        </span>
      )}
      {isEditable && (
        <>
          <GradeInputs
            fields={state.fields}
            evaluated={state.evaluated}
            rule={slot.inputRule}
            name={name}
            showRequired={showRequired}
            onChange={change}
            onSubmit={goToNext}
          />
          <SaveState state={state} className="w-48 text-sm" />
          <div className="flex gap-1">
            {/* Typed before a reload, or refused: that does not save by itself. */}
            {state.isDirty &&
              !isActive &&
              !state.isSaving &&
              !state.isWaiting &&
              !state.isConflict &&
              state.evaluated.grade && (
                <Button
                  size="icon"
                  aria-label={t('grading.saveRow', { name })}
                  onClick={() => void drafts.submit(key)}
                >
                  <SaveIcon aria-hidden />
                </Button>
              )}
            {state.isDirty ? (
              <Button
                size="icon"
                variant="outline"
                disabled={state.isSaving}
                aria-label={t('grading.discardRow', { name })}
                // Safari does not focus buttons, it would look like leaving the row.
                onMouseDown={(event) => event.preventDefault()}
                // Between two fields it would be where Enter or Space hits it by mistake.
                tabIndex={-1}
                aria-keyshortcuts="Escape"
                onClick={undo}
              >
                <UndoIcon aria-hidden />
              </Button>
            ) : (
              <ConfirmDialog
                destructive
                trigger={
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={!state.saved}
                    tabIndex={-1}
                    data-delete
                    aria-keyshortcuts="Alt+Delete Alt+Backspace"
                    aria-label={t('grading.deleteRow', { name })}
                    onClick={() => setShown(state.saved)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                }
                onCloseAutoFocus={(event) => {
                  // The button is disabled without a grade.
                  event.preventDefault();
                  findInput(row.current)?.focus();
                }}
                title={t('grading.deleteTitle')}
                description={t('grading.deleteText', {
                  name,
                  grade: shown ? formatEntered(shown.value) : '',
                  apparatus: apparatusName(slot.apparatus),
                })}
                confirmLabel={t('common:actions.delete')}
                fields={{
                  intent: 'delete',
                  entryId: slot.entryId,
                  apparatus: slot.apparatus,
                  version: String(shown?.version),
                }}
              />
            )}
          </div>
          {state.isConflict && (
            <div className="w-full">
              <ConflictNotice
                state={state}
                onUseSaved={() => drafts.discard(key)}
                onUseOwn={() => void drafts.overwrite(key, state.saved)}
              />
            </div>
          )}
          {state.rejected && (
            <div className="w-full">
              <RejectedNotice code={state.rejected} />
            </div>
          )}
        </>
      )}
    </li>
  );
}
