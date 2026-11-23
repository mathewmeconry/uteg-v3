import { z } from 'zod';
import {
  evaluateFields,
  isSameGrade,
  type GradeFields,
  type StoredGrade,
} from '~/lib/domain/gradeInput';
import type { GradeRequest, GradeResult } from '~/lib/gradeRequests';
import type { InputRule } from '~/modules/types';

const gradeSchema = z.object({ value: z.number(), attempts: z.array(z.number()) });

const draftSchema = z.object({
  entryId: z.string(),
  apparatus: z.string(),
  /** Whose grade it is, for input that is kept although the person is no longer listed. */
  name: z.string(),
  inputRule: z.object({ attempts: z.number(), aggregation: z.enum(['NONE', 'MAX', 'MIN', 'AVG']) }),
  fields: z.object({ attempts: z.array(z.string()), final: z.string() }),
  /** The saved grade when the input started. */
  base: gradeSchema.nullable(),
  /** Submitted and not confirmed by the server yet. Sent again until it is. */
  queued: z.boolean(),
});

export type Draft = z.infer<typeof draftSchema> & {
  /** Why the server refused it. Not sent again by itself. */
  rejected: Exclude<(GradeResult & { ok: false })['code'], 'OFFLINE' | 'GONE'> | null;
  saving: boolean;
  /** The last attempt to send it got no answer. */
  failed: boolean;
  /** Saved, but maybe not yet part of the loaded data. */
  confirmed: { grade: StoredGrade; savedAt: number } | null;
};

/** What a draft needs to know about a starter. */
export type GradedSlot = {
  entryId: string;
  apparatus: string;
  firstname: string;
  lastname: string;
  inputRule: InputRule;
  grade: StoredGrade | null;
};

export type Drafts = ReadonlyMap<string, Draft>;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function draftKey({ apparatus, entryId }: { apparatus: string; entryId: string }) {
  return `${apparatus}:${entryId}`;
}

/**
 * Grades that were typed and are not saved yet. They survive a reload in the storage and a lost
 * connection: submitted ones are sent until the server confirms them, see useGradeDrafts.
 */
export function createDraftStore({
  prefix,
  storage,
  send,
}: {
  prefix: string;
  storage: () => Storage | null;
  send: (request: GradeRequest) => Promise<GradeResult>;
}) {
  let drafts: Drafts = new Map();
  const listeners = new Set<() => void>();
  const running = new Map<string, Promise<GradeResult>>();

  function set(key: string, draft: Draft | null) {
    const next = new Map(drafts);
    if (draft) next.set(key, draft);
    else next.delete(key);
    drafts = next;
    write(key, draft);
    for (const listener of listeners) listener();
  }

  function patch(key: string, changes: Partial<Draft>) {
    const draft = drafts.get(key);
    if (draft) set(key, { ...draft, ...changes });
  }

  function write(key: string, draft: Draft | null) {
    try {
      if (draft && !draft.confirmed) {
        storage()?.setItem(`${prefix}:${key}`, JSON.stringify(draftSchema.parse(draft)));
      } else {
        storage()?.removeItem(`${prefix}:${key}`);
      }
    } catch {
      // Storage full or blocked. The draft still lives as long as the page.
    }
  }

  async function sendDraft(key: string): Promise<GradeResult> {
    const draft = drafts.get(key);
    const grade = draft && evaluateFields(draft.fields, draft.inputRule).grade;
    if (!draft || !grade) return { ok: false, code: 'INVALID_GRADE' };

    const { entryId, apparatus, base } = draft;
    set(key, { ...draft, queued: true, saving: true, rejected: null, failed: false });
    const result = await send({ intent: 'save', entryId, apparatus, grade, previous: base });

    const current = drafts.get(key);
    if (!current) return result;
    const wasEdited = current.fields !== draft.fields;
    if (result.ok) {
      if (wasEdited) patch(key, { saving: false, base: grade });
      else {
        const confirmed = { grade, savedAt: result.savedAt };
        patch(key, { saving: false, queued: false, confirmed });
      }
    } else if (result.code === 'OFFLINE' || result.code === 'GONE') {
      patch(key, { saving: false, failed: true });
    } else {
      patch(key, { saving: false, queued: false, rejected: wasEdited ? null : result.code });
    }
    return result;
  }

  async function submit(key: string): Promise<GradeResult> {
    const previous = running.get(key);
    const promise = (previous ?? Promise.resolve()).then(() => {
      const draft = drafts.get(key);
      // Confirmed while waiting for the previous attempt.
      if (draft?.confirmed) return { ok: true, savedAt: draft.confirmed.savedAt } as const;
      return sendDraft(key);
    });
    running.set(key, promise);
    try {
      return await promise;
    } finally {
      if (running.get(key) === promise) running.delete(key);
    }
  }

  return {
    getSnapshot: () => drafts,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Restores what was typed before a reload. */
    load() {
      const store = storage();
      const restored = new Map(drafts);
      for (let index = 0; store && index < store.length; index++) {
        const name = store.key(index);
        if (!name?.startsWith(`${prefix}:`)) continue;
        const parsed = draftSchema.safeParse(parseJson(store.getItem(name)));
        if (!parsed.success) continue;
        const key = draftKey(parsed.data);
        if (restored.has(key)) continue;
        restored.set(key, {
          ...parsed.data,
          rejected: null,
          saving: false,
          failed: parsed.data.queued,
          confirmed: null,
        });
      }
      if (restored.size === drafts.size) return;
      drafts = restored;
      for (const listener of listeners) listener();
    },

    /** Typing. `saved` is the grade currently shown as saved. */
    change(slot: GradedSlot, saved: StoredGrade | null, fields: GradeFields) {
      const key = draftKey(slot);
      const existing = drafts.get(key);
      const open = existing?.confirmed ? undefined : existing;
      const base = open ? open.base : saved;
      const { grade, isEmpty } = evaluateFields(fields, slot.inputRule);
      const isUnchanged = isEmpty ? saved === null : grade !== null && isSameGrade(grade, saved);
      if (isUnchanged && !open?.saving) return set(key, null);
      set(key, {
        entryId: slot.entryId,
        apparatus: slot.apparatus,
        name: `${slot.firstname} ${slot.lastname}`,
        inputRule: slot.inputRule,
        fields,
        base,
        queued: false,
        rejected: null,
        saving: open?.saving ?? false,
        failed: false,
        confirmed: null,
      });
    },

    /** Sends a draft. Until the server answers it is also sent by `retry`. */
    submit,

    /** Replaces the grade that someone else saved meanwhile. */
    overwrite(key: string, saved: StoredGrade | null) {
      patch(key, { base: saved });
      return submit(key);
    },

    discard(key: string) {
      set(key, null);
    },

    async retry() {
      const waiting = [...drafts].filter(([, { queued, saving }]) => queued && !saving);
      await Promise.all(waiting.map(([key]) => submit(key)));
    },

    /** Forgets what is part of the data loaded at `loadedAt`. */
    reconcile(slots: readonly GradedSlot[], loadedAt: number) {
      for (const [key, draft] of drafts) {
        if (draft.confirmed) {
          if (loadedAt >= draft.confirmed.savedAt) set(key, null);
          continue;
        }
        const slot = slots.find((item) => draftKey(item) === key);
        if (!slot?.grade || draft.saving) continue;
        const { grade } = evaluateFields(draft.fields, draft.inputRule);
        if (grade && isSameGrade(grade, slot.grade)) set(key, null);
      }
    },
  };
}

/** The saved grade of a starter and what happens with the input. */
export function getSlotState(
  slot: GradedSlot,
  { fields, draft, loadedAt }: { fields: GradeFields; draft: Draft | undefined; loadedAt: number },
) {
  const isNewer = draft?.confirmed && draft.confirmed.savedAt > loadedAt;
  const saved = isNewer ? draft.confirmed!.grade : slot.grade;
  const open = draft && !draft.confirmed ? draft : null;
  const evaluated = evaluateFields(fields, slot.inputRule);
  const isConflict =
    open !== null &&
    !open.saving &&
    !isSameGrade(saved, open.base) &&
    !(evaluated.grade && isSameGrade(saved, evaluated.grade));
  return {
    saved,
    evaluated,
    isDirty: open !== null,
    isSaving: open?.saving ?? false,
    /** Submitted, not answered. */
    isWaiting: Boolean(open?.queued && !open.saving),
    isFailed: Boolean(open?.queued && open.failed),
    rejected: isConflict ? null : (open?.rejected ?? null),
    isConflict,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(text: string | null): unknown {
  try {
    return JSON.parse(text ?? 'null');
  } catch {
    return null;
  }
}
