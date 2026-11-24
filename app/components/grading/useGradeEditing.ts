import { useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { fullName, type TabletSlot } from '~/components/judging/types';
import type { GradeFields } from '~/lib/domain/gradeInput';
import { draftKey, type GradeDrafts } from './useGradeDrafts';

/**
 * The fields of one grade that save by themselves when they are left. Enter goes to the next one,
 * Escape takes back what was typed, Alt+Delete or Alt+Backspace clicks `data-delete` in the element.
 */
export function useGradeEditing({
  slot,
  drafts,
  element,
  findNext,
  onActiveChange,
}: {
  slot: TabletSlot;
  drafts: GradeDrafts;
  /** Around the fields. */
  element: RefObject<HTMLElement | null>;
  findNext: () => HTMLInputElement | null;
  /** Whether one of the fields has the focus. */
  onActiveChange: (isActive: boolean) => void;
}) {
  const { t } = useTranslation('judging');
  const [showRequired, setShowRequired] = useState(false);
  const state = drafts.get(slot);
  const key = draftKey(slot);
  /** Not set by what was restored after a reload: passing through must not save that. */
  const isTyped = useRef(false);
  const isCleared = state.isDirty && state.evaluated.isEmpty && !state.wasSent && !state.isConflict;

  function save() {
    if (!state.isDirty || state.isConflict) return;
    if (state.evaluated.grade) void drafts.submit(key);
    else setShowRequired(true);
  }

  function undo() {
    const name = fullName(slot);
    if (!state.wasSent || window.confirm(t('discardSent', { name }))) drafts.discard(key);
  }

  return {
    state,
    undo,
    showRequired: showRequired && state.isDirty,

    change(fields: GradeFields) {
      setShowRequired(false);
      isTyped.current = true;
      drafts.change(slot, fields);
    },

    /** Leaves the fields for the next ones, which saves them. */
    goToNext() {
      if (state.isConflict) return;
      if (state.isDirty && !isCleared && !state.evaluated.grade) return setShowRequired(true);
      const input = findNext();
      // Otherwise leaving the fields saves them.
      if (!input || !isTyped.current) save();
      input?.focus();
      input?.select();
    },

    handlers: {
      onFocus({ target }: FocusEvent) {
        if (target instanceof HTMLInputElement) onActiveChange(true);
      },
      onBlur({ currentTarget, target, relatedTarget }: FocusEvent) {
        if (currentTarget.contains(relatedTarget)) return;
        // The window lost the focus, the field did not: the value may be half typed.
        if (document.activeElement === target) return;
        onActiveChange(false);
        if (!isTyped.current) return;
        isTyped.current = false;
        // Clearing a field does not delete a grade.
        if (isCleared || !state.isDirty) drafts.discard(key);
        else save();
      },
      onKeyDown(event: KeyboardEvent) {
        if (!(event.target instanceof HTMLInputElement)) return;
        if (event.key === 'Escape' && state.isDirty && !state.isSaving) undo();
        // Some keyboards have only one of them.
        const isDelete = event.key === 'Delete' || event.key === 'Backspace';
        if (isDelete && event.altKey && !state.isDirty) {
          event.preventDefault();
          element.current?.querySelector<HTMLElement>('[data-delete]')?.click();
        }
      },
    },
  };
}

/** The first field that can be typed in. Attempts are disabled next to a final grade. */
export function findInput(element: Element | null | undefined) {
  return element?.querySelector<HTMLInputElement>('input:not(:disabled):not([readonly])') ?? null;
}
