import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { useFetcher, useFormAction, useRevalidator } from 'react-router';
import { createAutosaver, type Saved, type SaveResult } from '~/lib/autosave';

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
  isValid = () => true,
  isEqual = isSameJson,
  save,
}: {
  saved: Value;
  version?: string;
  /** Invalid values are not sent. Must not change. */
  isValid?: (value: Value) => boolean;
  isEqual?: (a: Value, b: Value) => boolean;
  /** `base` is what the user started from. The server refuses when it has another version. */
  save: (value: Value, base: Saved<Value>) => Promise<SaveResult>;
}) {
  const { revalidate } = useRevalidator();
  const [saver] = useState(() =>
    createAutosaver({
      saved: { value: saved, version },
      isEqual,
      isValid,
      save,
      onConflict: () => void revalidate(),
    }),
  );
  const { value, state, message, conflict } = useSyncExternalStore(
    saver.subscribe,
    saver.getSnapshot,
    saver.getSnapshot,
  );

  useEffect(() => saver.setSave(save), [saver, save]);
  useEffect(() => saver.setSaved({ value: saved, version }), [saver, saved, version]);

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
} | null;

/**
 * A `save` for useAutosave that posts to an action with autosaveClientAction. The action gets the
 * version of `base` and returns `{ error }` or `{ errors }` when it refuses, and
 * `{ conflict: true, error }` when there is a newer one. Resolves when the page has the new data.
 */
export function useActionSave<Value>(
  toFields: (value: Value, base: Saved<Value>) => Record<string, string | string[]>,
  { action }: { action?: string } = {},
) {
  const fetcher = useFetcher<ActionAnswer>();
  // Not the default of the fetcher: when the page is left, that is already the next page.
  const ownAction = useFormAction();
  const url = action ?? ownAction;
  const [answers, setAnswers] = useState(0);
  const handled = useRef(0);
  const resolve = useRef<((result: SaveResult) => void) | null>(null);
  const lastData = useRef<ActionAnswer | undefined>(undefined);

  const onAnswer = useEffectEvent(() => {
    // Without data of its own the fetcher still has the one from before.
    const answer = fetcher.data === lastData.current ? null : fetcher.data;
    lastData.current = fetcher.data;
    resolve.current?.(toResult(answer ?? null));
    resolve.current = null;
  });

  useEffect(
    () => () => {
      // The form is gone, so is the answer.
      resolve.current?.({ ok: false, reason: 'offline' });
      resolve.current = null;
    },
    [],
  );

  useEffect(() => {
    if (fetcher.state !== 'idle' || handled.current === answers) return;
    handled.current = answers;
    onAnswer();
  }, [answers, fetcher.state]);

  const { submit } = fetcher;
  return useCallback(
    (value: Value, base: Saved<Value>) =>
      new Promise<SaveResult>((done) => {
        resolve.current = done;
        const body = new URLSearchParams(
          Object.entries(toFields(value, base)).flatMap(([name, entry]) =>
            [entry].flat().map((item) => [name, item]),
          ),
        );
        submit(body, { method: 'post', action: url }).then(
          // The router shows its data in a transition too, the answer must not be seen before.
          () => startTransition(() => setAnswers((count) => count + 1)),
          () => done({ ok: false, reason: 'offline' }),
        );
      }),
    [submit, toFields, url],
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toResult(answer: ActionAnswer): SaveResult {
  const { error, errors, failed, conflict, version } = answer ?? {};
  if (conflict) return { ok: false, reason: 'conflict', message: error };
  const message = error ?? Object.values(errors ?? {}).find(Boolean);
  if (error || errors) return { ok: false, reason: 'refused', message };
  if (!failed) return { ok: true, version };
  const isRefused = failed >= 400 && failed < 500 && failed !== 408 && failed !== 429;
  return { ok: false, reason: isRefused ? 'refused' : 'offline' };
}
