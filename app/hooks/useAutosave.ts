import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { useFetcher, useFormAction, useRevalidator } from 'react-router';
import { createAutosaver, type Saved, type SaveResult } from '~/lib/autosave';
import { createRequestId } from '~/lib/gradeRequests';
import { isServerReachable } from '~/lib/reachable';
import { AUTOSAVE_FIELD, autosaveAnswers } from '~/lib/safeClientAction';

/**
 * Keeps the value of a form and saves it by itself: a moment after the last change, and at once
 * when a field is left, on Enter (spread `formProps`) and when the tab is hidden. Show the result
 * with `<SaveStatus state={state} message={message} onRetry={retry} />`. AutosaveGuard keeps the
 * page until it is saved.
 *
 * `saved` is what the server has, with its version. An unchanged form takes over what others
 * save. A changed one has a `conflict` and sends nothing until `resolveConflict`. `save` may be an
 * action, see useActionSave.
 */
export function useAutosave<Value>({
  saved,
  version,
  loadedAt,
  isValid = () => true,
  isEqual = isSameJson,
  save,
}: {
  saved: Value;
  version?: string;
  /** Server time before `saved` was loaded. */
  loadedAt?: number;
  /** Invalid values are not sent. Must not change. */
  isValid?: (value: Value) => boolean;
  isEqual?: (a: Value, b: Value) => boolean;
  /** `base` is what the user started from. The server refuses when it has another version. */
  save: (value: Value, base: Saved<Value>) => Promise<SaveResult>;
}) {
  const { revalidate } = useRevalidator();
  const [saver] = useState(() =>
    createAutosaver({
      saved: { value: saved, version, loadedAt },
      isEqual,
      isValid,
      save,
      // A failing loader would replace the form with the error page.
      async onConflict() {
        if (await isServerReachable()) await revalidate();
      },
    }),
  );
  const { value, state, message, conflict } = useSyncExternalStore(
    saver.subscribe,
    saver.getSnapshot,
    saver.getSnapshot,
  );

  useEffect(() => saver.setSave(save), [saver, save]);
  useEffect(
    () => saver.setSaved({ value: saved, version, loadedAt }),
    [saver, saved, version, loadedAt],
  );

  useEffect(() => {
    saver.start();
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') saver.flush();
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      saver.flush();
      // Browsers cancel requests of a page that is closed.
      if (saver.isUnsaved()) event.preventDefault();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', saver.flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', saver.flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      saver.dispose();
    };
  }, [saver]);

  return {
    value,
    setValue: saver.change,
    state,
    message,
    /** What somebody else saved. */
    conflict,
    resolveConflict: saver.resolveConflict,
    flush: saver.flush,
    retry: saver.retry,
    /** For the element around the fields. */
    formProps: {
      onBlur: saver.flush,
      onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) saver.flush();
      },
    },
  };
}

/** What actions return, `failed` is set by autosaveClientAction. */
type ActionAnswer = {
  error?: string;
  errors?: Record<string, string | undefined>;
  failed?: number;
  conflict?: boolean;
  version?: string;
  savedAt?: number;
} | null;

/**
 * A `save` for useAutosave that posts to an action with autosaveClientAction. The action gets the
 * version of `base` and returns `{ error }` or `{ errors }` when it refuses, and
 * `{ conflict: true, error }` when there is a newer one. After saving it returns
 * `{ version, savedAt: Date.now() }`. Resolves when the page has the new data.
 */
export function useActionSave<Value>(
  toFields: (value: Value, base: Saved<Value>) => Record<string, string | string[]>,
  { action }: { action?: string } = {},
) {
  const fetcher = useFetcher();
  // Not the default of the fetcher: when the page is left, that is already the next page.
  const ownAction = useFormAction();
  const url = action ?? ownAction;
  const [answered, setAnswered] = useState<string | null>(null);
  const pending = useRef<{ id: string; done: () => void } | null>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Of a request that was answered, but is not shown any more. Others still get theirs.
      if (pending.current && autosaveAnswers.has(pending.current.id)) pending.current.done();
    };
  }, []);

  // The answer comes before the page has the new data.
  useEffect(() => {
    if (fetcher.state === 'idle' && pending.current?.id === answered) pending.current?.done();
  }, [answered, fetcher.state]);

  const { submit } = fetcher;
  return useCallback(
    (value: Value, base: Saved<Value>) =>
      new Promise<SaveResult>((resolve) => {
        const id = createRequestId();
        function done() {
          if (pending.current?.id === id) pending.current = null;
          resolve(takeResult(id));
        }
        pending.current = { id, done };
        const fields = Object.entries({ ...toFields(value, base), [AUTOSAVE_FIELD]: id });
        const body = new URLSearchParams(
          fields.flatMap(([name, entry]) => [entry].flat().map((item) => [name, item])),
        );
        submit(body, { method: 'post', action: url }).then(() => {
          if (!isMounted.current) done();
          // The router shows its data in a transition too, the answer must not be seen before.
          else startTransition(() => setAnswered(id));
        }, done);
      }),
    [submit, toFields, url],
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function takeResult(id: string): SaveResult {
  // Interrupted, or it never reached the action.
  if (!autosaveAnswers.has(id)) return { ok: false, reason: 'offline' };
  const answer = autosaveAnswers.get(id) as ActionAnswer | undefined;
  autosaveAnswers.delete(id);
  const { error, errors, failed, conflict, version, savedAt } = answer ?? {};
  if (conflict) return { ok: false, reason: 'conflict', message: error };
  const message = error ?? Object.values(errors ?? {}).find(Boolean);
  if (error || errors) return { ok: false, reason: 'refused', message };
  if (!failed) return { ok: true, version, savedAt };
  const isRefused = failed >= 400 && failed < 500 && failed !== 408 && failed !== 429;
  return { ok: false, reason: isRefused ? 'refused' : 'offline' };
}
