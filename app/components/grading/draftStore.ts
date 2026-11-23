import { z } from 'zod';
import { evaluateFields, isSameGrade, type GradeFields } from '~/lib/domain/gradeInput';
import {
  createRequestId,
  type GradeRequest,
  type GradeResult,
  type SavedGrade,
} from '~/lib/gradeRequests';
import type { InputRule } from '~/modules/types';

const savedGradeSchema = z.object({
  id: z.string(),
  version: z.number(),
  requestId: z.string().nullable(),
  value: z.number(),
  attempts: z.array(z.number()),
}) satisfies z.ZodType<SavedGrade>;

const draftSchema = z.object({
  entryId: z.string(),
  apparatus: z.string(),
  /** Whose grade it is, for input that is kept although the person is no longer listed. */
  name: z.string(),
  inputRule: z.object({ attempts: z.number(), aggregation: z.enum(['NONE', 'MAX', 'MIN', 'AVG']) }),
  fields: z.object({ attempts: z.array(z.string()), final: z.string() }),
  /** The saved grade when the input started. */
  base: savedGradeSchema.nullable(),
  /** Submitted and not confirmed by the server yet. Sent again until it is. */
  queued: z.boolean(),
  /** The request that sends the fields as they are. Null before the first attempt. */
  requestId: z.string().nullable(),
  /** Sent with other fields and not answered, so they may have been saved or still arrive. */
  unanswered: z.array(z.string()),
});

export type Draft = z.infer<typeof draftSchema> & {
  /** Why the server refused it. Not sent again by itself. */
  rejected: Exclude<(GradeResult & { ok: false })['code'], 'OFFLINE' | 'GONE'> | null;
  saving: boolean;
  /** The last attempt to send it got no answer. */
  failed: boolean;
  /** What this device saved last, while typing again before the data has it. */
  lastSaved: { grade: SavedGrade | null; savedAt: number } | null;
  /** Saved, but maybe not yet part of the loaded data. */
  confirmed: { grade: SavedGrade | null; savedAt: number } | null;
};

/** What a draft needs to know about a starter. */
export type GradedSlot = {
  entryId: string;
  apparatus: string;
  firstname: string;
  lastname: string;
  withdrawn: boolean;
  inputRule: InputRule;
  grade: SavedGrade | null;
};

export type Drafts = ReadonlyMap<string, Draft>;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const MAX_UNANSWERED = 100;

export function draftKey({ apparatus, entryId }: { apparatus: string; entryId: string }) {
  return `${apparatus}:${entryId}`;
}

/** Whether something of it was sent that the server has not answered. */
export function wasSent({ requestId, unanswered }: Draft) {
  return requestId !== null || unanswered.length > 0;
}

/** Whether it says the same as the saved grade it started from, and nothing else was sent. */
export function isUntouched(draft: Draft) {
  const { grade, isEmpty } = evaluateFields(draft.fields, draft.inputRule);
  const isSame = isEmpty ? draft.base === null : grade !== null && isSameGrade(grade, draft.base);
  return isSame && !wasSent(draft);
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
  /** Being typed. */
  const active = new Set<string>();

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
      if (draft && !draft.confirmed && !isUntouched(draft)) {
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

    const { entryId, apparatus, base, unanswered } = draft;
    const requestId = draft.requestId ?? createRequestId();
    // Stored before it is sent: after a reload it must be known that it may arrive.
    set(key, { ...draft, requestId, queued: true, saving: true, rejected: null, failed: false });
    const result = await send({
      intent: 'save',
      entryId,
      apparatus,
      grade,
      previous: base && { id: base.id, version: base.version },
      requestId,
      supersedes: unanswered,
    });

    const current = drafts.get(key);
    if (!current) return result;
    const wasEdited = current.fields !== draft.fields;
    if (result.ok) {
      // Whatever was sent before has an older base and is refused if it still arrives.
      const answered = { saving: false, requestId: null, unanswered: [] };
      const saved = result.grade ?? null;
      const confirmed = { grade: saved, savedAt: result.savedAt };
      if (wasEdited) patch(key, { ...answered, base: saved, lastSaved: confirmed });
      else {
        patch(key, { ...answered, queued: false, confirmed });
      }
    } else if (result.code === 'OFFLINE' || result.code === 'GONE') {
      patch(key, { saving: false, failed: true });
    } else {
      patch(key, {
        saving: false,
        queued: false,
        // Answered, unlike earlier ones.
        requestId: null,
        unanswered: current.unanswered.filter((id) => id !== requestId),
        rejected: wasEdited ? null : result.code,
      });
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
          lastSaved: null,
          confirmed: null,
        });
      }
      if (restored.size === drafts.size) return;
      drafts = restored;
      for (const listener of listeners) listener();
    },

    /** Typing. `saved` is the grade currently shown as saved. */
    change(slot: GradedSlot, saved: SavedGrade | null, fields: GradeFields) {
      const key = draftKey(slot);
      const existing = drafts.get(key);
      const open = existing?.confirmed ? undefined : existing;
      active.add(key);
      const unanswered = [
        ...(open?.unanswered ?? []),
        ...(open?.requestId ? [open.requestId] : []),
      ];
      set(key, {
        entryId: slot.entryId,
        apparatus: slot.apparatus,
        name: `${slot.firstname} ${slot.lastname}`,
        inputRule: slot.inputRule,
        fields,
        base: open ? open.base : saved,
        queued: false,
        requestId: null,
        unanswered: unanswered.slice(-MAX_UNANSWERED),
        rejected: null,
        saving: open?.saving ?? false,
        failed: false,
        lastSaved: existing?.confirmed ?? existing?.lastSaved ?? null,
        confirmed: null,
      });
    },

    /** Sends a draft. Until the server answers it is also sent by `retry`. */
    submit,

    /** Replaces the grade that someone else saved meanwhile. */
    overwrite(key: string, saved: SavedGrade | null) {
      // Another request: the one before may have been refused because of its base.
      const draft = drafts.get(key);
      const unanswered = [
        ...(draft?.unanswered ?? []),
        ...(draft?.requestId ? [draft.requestId] : []),
      ];
      patch(key, { base: saved, requestId: null, unanswered });
      return submit(key);
    },

    discard(key: string) {
      active.delete(key);
      set(key, null);
    },

    /** Typing has ended. Until then also what equals the saved grade stays as it was typed. */
    leave(key: string) {
      active.delete(key);
      const draft = drafts.get(key);
      if (draft && !draft.confirmed && isUntouched(draft)) set(key, null);
    },

    async retry() {
      const waiting = [...drafts].filter(([, { queued, saving }]) => queued && !saving);
      await Promise.all(waiting.map(([key]) => submit(key)));
    },

    /** Forgets what is part of the data loaded at `loadedAt` and notices what changed there. */
    reconcile(slots: readonly GradedSlot[], loadedAt: number) {
      for (const [key, draft] of drafts) {
        if (draft.confirmed) {
          if (loadedAt >= draft.confirmed.savedAt) set(key, null);
          continue;
        }
        const slot = slots.find((item) => draftKey(item) === key);
        if (!slot || draft.saving) continue;
        // Loaded before the last save of this device.
        if (draft.lastSaved && draft.lastSaved.savedAt > loadedAt) continue;
        const { grade: saved } = slot;
        const { grade } = evaluateFields(draft.fields, draft.inputRule);

        if (saved && saved.requestId !== null && saved.requestId === draft.requestId) {
          set(key, null);
        } else if (
          saved &&
          grade &&
          isSameGrade(grade, saved) &&
          !wasSent(draft) &&
          !active.has(key)
        ) {
          set(key, null);
        } else if (saved?.requestId && draft.unanswered.includes(saved.requestId)) {
          // Its answer got lost. Earlier ones have an older base and are refused from now on.
          const index = draft.unanswered.indexOf(saved.requestId);
          patch(key, { base: saved, unanswered: draft.unanswered.slice(index + 1) });
        } else if (saved && !isSameVersion(saved, draft.base) && isSameGrade(saved, draft.base)) {
          const rejected = draft.rejected === 'GRADE_CHANGED' ? null : draft.rejected;
          patch(key, { base: saved, rejected });
        }
        // The division was started again, or the person added again.
        const isOver =
          draft.rejected === 'ENTRY_NOT_JUDGEABLE' ||
          (draft.rejected === 'ENTRY_WITHDRAWN' && !slot.withdrawn);
        if (isOver && drafts.has(key)) patch(key, { rejected: null });
      }
    },
  };
}

/** The saved grade of a starter and what happens with the input. */
export function getSlotState(
  slot: GradedSlot,
  { fields, draft, loadedAt }: { fields: GradeFields; draft: Draft | undefined; loadedAt: number },
) {
  const own = draft?.confirmed ?? draft?.lastSaved;
  const saved = own && own.savedAt > loadedAt ? own.grade : slot.grade;
  const open = draft && !draft.confirmed ? draft : null;
  const evaluated = evaluateFields(fields, slot.inputRule);
  const isOwn = (grade: SavedGrade | null) =>
    open !== null &&
    grade?.requestId != null &&
    [open.requestId, ...open.unanswered].includes(grade.requestId);
  const isConflict =
    open !== null &&
    !open.saving &&
    !isSameVersion(saved, open.base) &&
    !isSameGrade(saved, open.base) &&
    !isSameGrade(saved, evaluated.grade) &&
    !isOwn(saved);
  return {
    saved,
    evaluated,
    isDirty: open !== null && (isConflict || !isUntouched(open)),
    isSaving: open?.saving ?? false,
    /** Submitted, not answered. */
    isWaiting: Boolean(open?.queued && !open.saving),
    isFailed: Boolean(open?.queued && open.failed),
    /** Something was sent without an answer, so it may still be saved. */
    wasSent: open !== null && wasSent(open),
    rejected: isConflict ? null : (open?.rejected ?? null),
    isConflict,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Version = { id: string; version: number } | null;

function isSameVersion(a: Version, b: Version) {
  return a?.id === b?.id && a?.version === b?.version;
}

function parseJson(text: string | null): unknown {
  try {
    return JSON.parse(text ?? 'null');
  } catch {
    return null;
  }
}
