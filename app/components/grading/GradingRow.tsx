import { SaveIcon, Trash2Icon, UndoIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { fullName, type TabletSlot } from '~/components/judging/types';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useApparatusName } from '~/hooks/useApparatusName';
import { formatEntered } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import { draftKey } from './draftStore';
import { GradeInputs } from './GradeInputs';
import { ConflictNotice, RejectedNotice, SaveState } from './SaveState';
import type { GradeDrafts } from './useGradeDrafts';

/** One starter in the grading tables. Every row is saved on its own. */
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
  const [showRequired, setShowRequired] = useState(false);
  const state = drafts.get(slot);
  /** The grade in the open delete dialog, also when another one is saved meanwhile. */
  const [shown, setShown] = useState(state.saved);
  const key = draftKey(slot);
  const name = fullName(slot);
  const isEditable = canEdit && !slot.withdrawn;

  function save() {
    if (state.isSaving || state.isConflict) return;
    if (!state.evaluated.grade) setShowRequired(true);
    else if (state.isDirty) void drafts.submit(key);
  }

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2',
        state.isDirty && 'bg-warning/15',
      )}
    >
      <span className="w-6 text-right text-muted-foreground tabular-nums">{position}.</span>
      <span className={cn('min-w-40 flex-1', slot.withdrawn && 'line-through')}>
        <span className="block font-medium">{name}</span>
        <span className="block text-sm text-muted-foreground">
          {slot.clubName} · {slot.category} {t(`sexShort.${slot.sex}`)}
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
            showRequired={showRequired && state.isDirty}
            disabled={state.isSaving}
            onChange={(fields) => {
              setShowRequired(false);
              drafts.change(slot, state.saved, fields);
            }}
            onSubmit={save}
          />
          <SaveState state={state} className="w-48 text-sm" />
          <div className="flex gap-1">
            <Button
              size="icon"
              variant={state.isDirty ? 'default' : 'outline'}
              disabled={!state.isDirty || state.isSaving || state.isConflict}
              aria-label={t('grading.saveRow', { name })}
              onClick={save}
            >
              <SaveIcon aria-hidden />
            </Button>
            {state.isDirty ? (
              <Button
                size="icon"
                variant="outline"
                disabled={state.isSaving}
                aria-label={t('grading.discardRow', { name })}
                onClick={() => {
                  if (!state.wasSent || window.confirm(t('discardSent', { name }))) {
                    drafts.discard(key);
                  }
                }}
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
                    aria-label={t('grading.deleteRow', { name })}
                    onClick={() => setShown(state.saved)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                }
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
                  gradeId: shown?.id ?? '',
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
