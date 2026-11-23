import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRevalidator } from 'react-router';
import { evaluateFields, isSameGrade, toFields, type GradeFields } from '~/lib/domain/gradeInput';
import type { DomainErrorCode } from '~/lib/errors';
import { sendGradeRequest, type GradeResult, type SavedGrade } from '~/lib/gradeRequests';
import { isServerReachable } from '~/lib/reachable';
import type { InputRule } from '~/modules/types';

/** What was typed for one starter and is not saved yet. */
export type Draft = {
  entryId: string;
  apparatus: string;
  /** Whose grade it is, also when the person is no longer listed. */
  name: string;
  inputRule: InputRule;
  fields: GradeFields;
  /** The saved grade when the input started. */
  base: SavedGrade | null;
  /** Submitted without an answer. Sent again until there is one. */
  queued: boolean;
  /** Sent without an answer, so it may be saved even after the input was changed. */
  sent: boolean;
  saving: boolean;
  /** Why the server refused it. */
  rejected: DomainErrorCode | null;
};

export type GradedSlot = {
  entryId: string;
  apparatus: string;
  firstname: string;
  lastname: string;
  inputRule: InputRule;
  grade: SavedGrade | null;
};

export type GradeDrafts = ReturnType<typeof useGradeDrafts>;

const RETRY_MS = 5_000;
const NO_DRAFTS: ReadonlyMap<string, Draft> = new Map();

export function draftKey({ apparatus, entryId }: { apparatus: string; entryId: string }) {
  return `${apparatus}:${entryId}`;
}

/** Whether it says the same as the saved grade it started from. */
export function isUntouched({ fields, inputRule, base, sent }: Draft) {
  const { grade, isEmpty } = evaluateFields(fields, inputRule);
  return !sent && (isEmpty ? base === null : grade !== null && isSameGrade(grade, base));
}

/**
 * The unsaved grades of a page. They are kept in the browser under `storageKey` until the server
 * has saved them, so they survive a reload and a lost connection. A grade that somebody else
 * changed meanwhile is never overwritten without asking.
 */
export function useGradeDrafts({
  url,
  storageKey,
  loadedAt,
}: {
  /** Where grades are sent. */
  url: string;
  storageKey: string;
  /** Server time before the grades of the page were loaded. */
  loadedAt: number;
}) {
  const { revalidate } = useRevalidator();
  const [store] = useState(() => createStore(storageKey));
  const drafts = useSyncExternalStore(store.subscribe, store.get, () => NO_DRAFTS);
  /** What this page saved. Shown until the loaded data has it. */
  const [own, setOwn] = useState<Record<string, { grade: SavedGrade; savedAt: number }>>({});

  useEffect(() => store.restore(), [store]);

  async function refresh() {
    if (await isServerReachable()) await revalidate();
  }

  const submit = useCallback(
    (key: string) =>
      submitDraft(store, url, key, (grade, savedAt) =>
        setOwn((current) => ({ ...current, [key]: { grade, savedAt } })),
      ),
    [store, url],
  );

  const retry = useCallback(() => {
    for (const [key, { queued, saving }] of store.get()) {
      if (queued && !saving) void submit(key);
    }
  }, [store, submit]);

  const hasQueued = [...drafts.values()].some(({ queued }) => queued);
  useEffect(() => {
    if (!hasQueued) return;
    const timer = setInterval(retry, RETRY_MS);
    return () => clearInterval(timer);
  }, [hasQueued, retry]);

  async function submitAndRefresh(key: string) {
    const result = await submit(key);
    void refresh();
    return result;
  }

  /** The saved grade of a starter and what happens with the input. */
  function get(slot: GradedSlot) {
    const key = draftKey(slot);
    const newer = own[key] && own[key].savedAt > loadedAt ? own[key].grade : null;
    const saved = newer ?? slot.grade;
    const draft = drafts.get(key);
    const isOutdated = draft !== undefined && draft.base?.version !== saved?.version;
    // E.g. when only the answer got lost.
    const typed = draft ? evaluateFields(draft.fields, slot.inputRule).grade : null;
    const isSaved = isOutdated && typed !== null && isSameGrade(typed, saved);
    const isDirty = draft !== undefined && !isUntouched(draft) && !isSaved;
    const fields =
      draft && (isDirty || !isOutdated) ? draft.fields : toFields(saved, slot.inputRule);
    return {
      fields,
      saved,
      evaluated: evaluateFields(fields, slot.inputRule),
      isDirty,
      isSaving: isDirty && draft.saving,
      /** Submitted, not answered. */
      isWaiting: isDirty && draft.queued && !draft.saving,
      wasSent: isDirty && draft.sent,
      isConflict: isDirty && !draft.saving && isOutdated,
      rejected: isDirty && !isOutdated ? draft.rejected : null,
    };
  }

  return {
    drafts,
    hasSaved: Object.keys(own).length > 0,
    get,
    retry,
    submit: submitAndRefresh,

    change(slot: GradedSlot, fields: GradeFields) {
      const { saved, isDirty } = get(slot);
      const draft = isDirty ? drafts.get(draftKey(slot)) : undefined;
      store.set(draftKey(slot), {
        entryId: slot.entryId,
        apparatus: slot.apparatus,
        name: `${slot.firstname} ${slot.lastname}`,
        inputRule: slot.inputRule,
        fields,
        base: draft ? draft.base : saved,
        queued: false,
        sent: draft?.sent ?? false,
        saving: draft?.saving ?? false,
        rejected: null,
      });
    },

    /** Replaces the grade that somebody else saved meanwhile. */
    overwrite(key: string, saved: SavedGrade | null) {
      store.patch(key, { base: saved });
      return submitAndRefresh(key);
    },

    discard(key: string) {
      const wasSent = drafts.get(key)?.sent;
      store.remove(key);
      // It may have been saved after all.
      if (wasSent) void refresh();
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function submitDraft(
  store: ReturnType<typeof createStore>,
  url: string,
  key: string,
  onSaved: (grade: SavedGrade, savedAt: number) => void,
): Promise<GradeResult> {
  const draft = store.get().get(key);
  const grade = draft && evaluateFields(draft.fields, draft.inputRule).grade;
  if (!grade) return { ok: false, code: 'INVALID_GRADE' };
  // Sent as soon as the running request is answered.
  store.patch(key, { queued: true });
  if (draft.saving) return { ok: false, code: 'OFFLINE' };

  store.patch(key, { sent: true, saving: true, rejected: null });
  const { entryId, apparatus, base } = draft;
  const version = base?.version ?? null;
  const request = { intent: 'save', entryId, apparatus, grade, version } as const;
  const result = await sendGradeRequest(url, request);

  const current = store.get().get(key);
  const isEdited = current?.fields !== draft.fields;
  if (result.ok && result.grade) {
    onSaved(result.grade, result.savedAt);
    if (!isEdited) {
      store.remove(key);
    } else if (current) {
      store.patch(key, { base: result.grade, sent: false, saving: false });
      if (current.queued) return submitDraft(store, url, key, onSaved);
    }
  } else if (!result.ok && result.code !== 'OFFLINE' && result.code !== 'GONE') {
    const rejected = isEdited ? null : result.code;
    store.patch(key, { queued: false, sent: false, saving: false, rejected });
  } else {
    store.patch(key, { saving: false });
  }
  return result;
}

function createStore(storageKey: string) {
  let drafts = NO_DRAFTS;
  const listeners = new Set<() => void>();

  function show(next: ReadonlyMap<string, Draft>) {
    drafts = next;
    for (const listener of listeners) listener();
  }

  function readStored() {
    return new Map(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as [string, Draft][]);
  }

  function set(key: string, draft: Draft | null) {
    try {
      // Only this one, another tab may have stored others.
      const stored = readStored();
      if (draft && !isUntouched(draft)) stored.set(key, draft);
      else stored.delete(key);
      localStorage.setItem(storageKey, JSON.stringify([...stored]));
    } catch {
      // Full or blocked. The drafts still live as long as the page.
    }
    const next = new Map(drafts);
    if (draft) next.set(key, draft);
    else next.delete(key);
    show(next);
  }

  return {
    get: () => drafts,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set,
    patch(key: string, changes: Partial<Draft>) {
      const draft = drafts.get(key);
      if (draft) set(key, { ...draft, ...changes });
    },
    remove: (key: string) => set(key, null),
    /** After a reload. */
    restore() {
      try {
        const stored = [...readStored()];
        if (stored.length === 0) return;
        show(
          new Map([
            ...drafts,
            ...stored.map(([key, draft]) => [key, { ...draft, saving: false }] as const),
          ]),
        );
      } catch {
        // Blocked, or written by another version of the app.
      }
    },
  };
}
