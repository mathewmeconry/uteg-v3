export type SaveResult =
  | { ok: true }
  /** Without an answer it may have been saved or not. It is sent again by itself. */
  | { ok: false; reason: 'offline' }
  /** Refused, or somebody else changed it since. Only another change is sent. */
  | { ok: false; reason: 'refused' | 'conflict'; message?: string };

export type AutosaveStatus = {
  state: 'idle' | 'saving' | 'saved' | 'error';
  isConflict: boolean;
  message?: string;
};

const DELAY_MS = 800;
const RETRY_MS = 5_000;

/**
 * Saves a value some time after its last change. Never sends two requests at once: what changes
 * meanwhile is sent afterwards, so the last value wins. Invalid values wait.
 */
export function createAutosaver<Value>({
  saved: initial,
  isEqual,
  save: initialSave,
  delay = DELAY_MS,
}: {
  saved: Value;
  isEqual: (a: Value, b: Value) => boolean;
  save: (value: Value) => Promise<SaveResult>;
  delay?: number;
}) {
  let save = initialSave;
  let saved = initial;
  let value = initial;
  let isValid = true;
  let isSending = false;
  /** Sent without an answer, so the server may have something else than `saved`. */
  let isUncertain = false;
  let isDisposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: AutosaveStatus = { state: 'idle', isConflict: false };
  const listeners = new Set<() => void>();

  function setStatus(next: AutosaveStatus) {
    status = next;
    for (const listener of listeners) listener();
  }

  const isDirty = () => isUncertain || !isEqual(value, saved);

  function schedule(ms: number) {
    clearTimeout(timer);
    if (!isDisposed) timer = setTimeout(() => void run(), ms);
  }

  async function run() {
    clearTimeout(timer);
    if (isSending || !isValid || status.isConflict || !isDirty()) return;
    const sent = value;
    isSending = true;
    setStatus({ state: 'saving', isConflict: false });
    const result = await save(sent).catch((): SaveResult => ({ ok: false, reason: 'offline' }));
    isSending = false;

    if (result.ok) {
      saved = sent;
      isUncertain = false;
      setStatus({ state: 'saved', isConflict: false });
    } else if (result.reason === 'offline') {
      isUncertain = true;
      setStatus({ state: 'error', isConflict: false });
      return schedule(RETRY_MS);
    } else {
      setStatus({
        state: 'error',
        isConflict: result.reason === 'conflict',
        message: result.message,
      });
    }
    // Changed while it was sent.
    if (!isEqual(value, sent)) await run();
  }

  return {
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** What the user entered. */
    change(next: Value, nextIsValid: boolean) {
      const isChanged = !isEqual(value, next);
      if (!isChanged && isValid === nextIsValid) return;
      value = next;
      isValid = nextIsValid;
      clearTimeout(timer);
      if (isSending || status.isConflict) return;
      if (!isDirty() && status.state !== 'idle') {
        setStatus({ state: 'idle', isConflict: false });
      }
      if (isValid && isDirty()) schedule(delay);
      // The old one is still to be sent, but not what is invalid.
      else if (status.state === 'saved') setStatus({ state: 'idle', isConflict: false });
    },
    setSave(next: typeof save) {
      save = next;
    },
    /** What the server has now, e.g. after somebody else changed it. */
    setSaved(next: Value) {
      if (!isSending) saved = next;
    },
    /** Without waiting: leaving the field, Enter, another tab, "try again". */
    flush: () => void run(),
    /** The user decided: continue from what the server has now. */
    resolveConflict(next: Value) {
      saved = next;
      isUncertain = false;
      setStatus({ state: 'idle', isConflict: false });
    },
    isUnsaved: () => isSending || isDirty(),
    start() {
      isDisposed = false;
    },
    /** Sends what is left. A request that is running still sends what changed meanwhile. */
    dispose() {
      void run();
      isDisposed = true;
      clearTimeout(timer);
    },
  };
}
