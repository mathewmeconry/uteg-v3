import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { useFetcher, useFormAction } from 'react-router';
import { createAutosaver, type AutosaveStatus, type SaveResult } from '~/lib/autosave';

const IDLE: AutosaveStatus = { state: 'idle', isConflict: false };

/**
 * Saves what the user enters by itself: a moment after the last change, and at once when a field is
 * left, on Enter (spread `formProps`), in another tab and when the page is left. Show the result
 * with `<SaveStatus state={state} message={message} onRetry={flush} />`.
 *
 * `value` is what is entered and `saved` what the server has. `save` may be an action, see
 * useActionSave. With a conflict nothing is sent any more until `resolveConflict`.
 */
export function useAutosave<Value>({
  value,
  saved,
  isValid = true,
  isEqual = isSameJson,
  save,
}: {
  value: Value;
  saved: Value;
  /** Invalid values are not sent. */
  isValid?: boolean;
  isEqual?: (a: Value, b: Value) => boolean;
  save: (value: Value) => Promise<SaveResult>;
}) {
  const [saver] = useState(() => createAutosaver({ saved, isEqual, save }));
  const status = useSyncExternalStore(saver.subscribe, saver.getStatus, () => IDLE);

  // The newest one, e.g. with the version that the last save returned.
  useEffect(() => saver.setSave(save), [saver, save]);
  useEffect(() => saver.setSaved(saved), [saver, saved]);
  useEffect(() => saver.change(value, isValid), [saver, value, isValid]);

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
    ...status,
    flush: saver.flush,
    resolveConflict: saver.resolveConflict,
    /** For the element around the fields. */
    formProps: {
      onBlur: (_event: FocusEvent) => saver.flush(),
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
} | null;

/**
 * A `save` for useAutosave that posts to an action with autosaveClientAction. The action returns
 * `{ error }` or `{ errors }` when it refuses, and `{ conflict: true, error }` when somebody else
 * changed it since. Resolves when the page has the new data, so the next save sees the new version.
 * `toFields` adds that version, it is not part of the value.
 */
export function useActionSave<Value>(
  toFields: (value: Value) => Record<string, string | string[]>,
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

  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (fetcher.state !== 'idle' || handled.current === answers) return;
    handled.current = answers;
    onAnswer();
  }, [answers, fetcher.state]);

  const { submit } = fetcher;
  return useCallback(
    (value: Value) =>
      new Promise<SaveResult>((done) => {
        resolve.current = done;
        const body = new URLSearchParams(
          Object.entries(toFields(value)).flatMap(([name, entry]) =>
            [entry].flat().map((item) => [name, item]),
          ),
        );
        void submit(body, { method: 'post', action: url }).then(() => {
          // Nobody sees the answer any more, but what changed meanwhile is still sent.
          if (!isMounted.current) return done({ ok: true });
          // The router shows its data in a transition too, the answer must not be seen before.
          startTransition(() => setAnswers((count) => count + 1));
        });
      }),
    [submit, toFields, url],
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toResult(answer: ActionAnswer): SaveResult {
  const { error, errors, failed, conflict } = answer ?? {};
  if (conflict) return { ok: false, reason: 'conflict', message: error };
  const message = error ?? Object.values(errors ?? {}).find(Boolean);
  if (error || errors) return { ok: false, reason: 'refused', message };
  if (!failed) return { ok: true };
  const isRefused = failed >= 400 && failed < 500 && failed !== 408 && failed !== 429;
  return { ok: false, reason: isRefused ? 'refused' : 'offline' };
}
