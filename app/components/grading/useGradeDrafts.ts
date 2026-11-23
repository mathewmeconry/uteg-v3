import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRevalidator } from 'react-router';
import type { ConnectionStatus } from '~/hooks/useLiveUpdates';
import { toFields, type StoredGrade } from '~/lib/domain/gradeInput';
import { sendGradeRequest, type GradeResult } from '~/lib/gradeRequests';
import {
  createDraftStore,
  draftKey,
  getSlotState,
  type Drafts,
  type GradedSlot,
} from './draftStore';

const RETRY_MS = 5_000;
const NO_DRAFTS: Drafts = new Map();

export type GradeDrafts = ReturnType<typeof useGradeDrafts>;

/**
 * The unsaved grades of a page, kept in the browser under `prefix`. What was submitted is sent to
 * `url` again until the server answers. `slots` and `loadedAt` are the loaded data.
 */
export function useGradeDrafts({
  url,
  prefix,
  slots,
  loadedAt,
  status,
}: {
  url: string;
  prefix: string;
  slots: readonly GradedSlot[];
  loadedAt: number;
  status: ConnectionStatus;
}) {
  const { revalidate } = useRevalidator();
  const [store] = useState(() =>
    createDraftStore({
      prefix,
      storage: getStorage,
      send: (request) => sendGradeRequest(url, request),
    }),
  );
  const drafts = useSyncExternalStore(store.subscribe, store.getSnapshot, () => NO_DRAFTS);

  useEffect(() => store.load(), [store]);

  useEffect(() => store.reconcile(slots, loadedAt), [store, slots, loadedAt]);

  const retry = useCallback(() => void store.retry(), [store]);
  const hasWaiting = [...drafts.values()].some(({ queued, saving }) => queued && !saving);

  useEffect(() => {
    if (!hasWaiting) return;
    const timer = setInterval(retry, RETRY_MS);
    window.addEventListener('online', retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', retry);
    };
  }, [hasWaiting, retry]);

  useEffect(() => {
    if (status === 'open') retry();
  }, [status, retry]);

  // Whatever the answer was, the newest data belongs on the screen. Not awaited, because a saved
  // draft is shown until the data has arrived.
  async function afterAnswer(answer: Promise<GradeResult>) {
    const result = await answer;
    if (result.ok || result.code !== 'OFFLINE') void revalidate();
    return result;
  }

  return {
    drafts,
    get: (slot: GradedSlot) => {
      const draft = drafts.get(draftKey(slot));
      const fields =
        draft && (!draft.confirmed || draft.confirmed.savedAt > loadedAt)
          ? draft.fields
          : toFields(slot.grade, slot.inputRule);
      return { fields, ...getSlotState(slot, { fields, draft, loadedAt }) };
    },
    change: store.change,
    submit: (key: string) => afterAnswer(store.submit(key)),
    overwrite: (key: string, saved: StoredGrade | null) => afterAnswer(store.overwrite(key, saved)),
    discard: store.discard,
    retry,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    // Blocked by the browser.
    return null;
  }
}
