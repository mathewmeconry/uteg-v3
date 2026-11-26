import { SaveIcon, Trash2Icon, UndoIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { fullName, type TabletSlot } from '~/components/judging/types';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useApparatusName } from '~/hooks/useApparatusName';
import { categoryName } from '~/lib/categoryName';
import { formatEntered, toFields } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import { GradeInputs } from './GradeInputs';
import { ConflictNotice, RejectedNotice, SaveState } from './SaveState';
import { ScannedGrade } from './ScannedGrade';
import { draftKey, type GradeDrafts } from './useGradeDrafts';
import { findInput, useGradeEditing } from './useGradeEditing';

/** One starter in the list of an apparatus. */
export function GradingRow({
  slot,
  position,
  isNext = false,
  drafts,
  canEdit,
}: {
  slot: TabletSlot;
  position: number;
  /** The first one without a grade in the current round. */
  isNext?: boolean;
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
  // In place of the club, and not while typing, so that nothing moves.
  const showsState = isEditable && state.isDirty && (!isActive || state.isConflict);

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
      aria-current={isNext ? 'step' : undefined}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2 pr-2 pl-3',
        isNext && 'bg-accent',
        state.isDirty && 'bg-warning/15',
      )}
    >
      <span className="w-6 text-muted-foreground tabular-nums">{position}.</span>
      <span className={cn('min-w-0 flex-1 basis-28', slot.withdrawn && 'line-through')}>
        <span className="block font-medium">{name}</span>
        {!showsState && (
          <span className="block truncate text-xs text-muted-foreground">
            {categoryName(slot.category, t)} {t(`sexShort.${slot.sex}`)} {slot.divisionNumber} ·{' '}
            {slot.clubName}
          </span>
        )}
        {isEditable && (
          <SaveState state={state} className={showsState ? 'min-h-0 text-xs' : 'sr-only'} />
        )}
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
            compact
            showRequired={showRequired}
            onChange={change}
            onSubmit={goToNext}
          />
          <div className="ml-auto flex gap-1">
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
          {slot.scanned && !state.isDirty && (
            <ScannedGrade
              slot={slot}
              scanned={slot.scanned}
              saved={state.saved}
              onAccept={() => {
                drafts.change(slot, toFields(slot.scanned, slot.inputRule));
                void drafts.submit(key);
              }}
            />
          )}
        </>
      )}
    </li>
  );
}
