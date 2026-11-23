export type SaveResult =
  /** With the version it now has, unless the page is loaded again anyway. */
  | { ok: true; version?: string }
  /** Without an answer it may have been saved or not. It is sent again by itself. */
  | { ok: false; reason: 'offline' }
  /** Refused, or somebody else changed it since. Only another value is sent. */
  | { ok: false; reason: 'refused' | 'conflict'; message?: string };

/** What the server has, and its version if it has one. */
export type Saved<Value> = { value: Value; version?: string };

export type AutosaveSnapshot<Value> = {
  value: Value;
  state: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
  /** What somebody else saved while this form had other changes. */
  conflict: Saved<Value> | null;
};

const DELAY_MS = 800;
const RETRY_MS = 5_000;

export type Autosaver = {
  flush: () => void;
  isUnsaved: () => boolean;
  settle: () => Promise<void>;
};

/** The forms on the page, see AutosaveGuard. */
export const openAutosavers = new Set<Autosaver>();

/**
 * Keeps and saves a value some time after its last change. Never sends two requests at once: what
 * changes meanwhile is sent afterwards, so the last value wins. Invalid values wait.
 *
 * A request says which saved value (`base`) the user started from. When the server has another one,
 * an unchanged form takes it over and a changed one asks, so nobody's changes are overwritten.
 */
export function createAutosaver<Value>({
  saved: initial,
  isEqual,
  isValid,
  save: initialSave,
  onConflict = () => {},
  delay = DELAY_MS,
}: {
  saved: Saved<Value>;
  isEqual: (a: Value, b: Value) => boolean;
  isValid: (value: Value) => boolean;
  save: (value: Value, base: Saved<Value>) => Promise<SaveResult>;
  /** The server has something else. Load it and pass it to setSaved. */
  onConflict?: () => void;
  delay?: number;
}) {
  let save = initialSave;
  let base = initial;
  let value = initial.value;
  /** What arrived while a request was running. */
  let waiting: Saved<Value> | null = null;
  let isSending = false;
  /** Sent without an answer, so the server may have it. */
  let unanswered: { value: Value } | null = null;
  let refused: { value: Value } | null = null;
  /** The server has something else, but not yet this page. */
  let isOutdated = false;
  let isDisposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let snapshot: AutosaveSnapshot<Value> = { value, state: 'idle', conflict: null };
  const listeners = new Set<() => void>();
  const settled: (() => void)[] = [];

  function update(changes: Partial<AutosaveSnapshot<Value>>) {
    snapshot = { ...snapshot, value, ...changes };
    for (const listener of listeners) listener();
  }

  const isDirty = () => unanswered !== null || !isEqual(value, base.value);
  const isBlocked = () => snapshot.conflict !== null || isOutdated || !isValid(value);
  const isRefused = () => refused !== null && isEqual(refused.value, value);

  function schedule(ms: number) {
    clearTimeout(timer);
    if (!isDisposed) timer = setTimeout(() => void run(), ms);
  }

  async function run() {
    clearTimeout(timer);
    if (isSending || isBlocked() || isRefused() || !isDirty()) return;
    const sent = value;
    const sentBase = base;
    isSending = true;
    update({ state: 'saving', message: undefined });
    const result = await save(sent, sentBase).catch((): SaveResult => {
      return { ok: false, reason: 'offline' };
    });
    isSending = false;
    handle(result, sent, sentBase);
    const arrived = waiting;
    waiting = null;
    if (arrived) receive(arrived);
    // Changed while it was sent.
    if (!isSending && result.ok && isDirty()) await run();
    else if (!isEqual(value, sent)) schedule(0);
    for (const done of settled.splice(0)) done();
  }

  function handle(result: SaveResult, sent: Value, sentBase: Saved<Value>) {
    if (result.ok) {
      base = { value: sent, version: result.version ?? sentBase.version };
      unanswered = null;
      refused = null;
      update({ state: isEqual(value, sent) ? 'saved' : 'idle' });
    } else if (result.reason === 'offline') {
      unanswered = { value: sent };
      update({ state: 'error' });
      schedule(RETRY_MS);
    } else if (result.reason === 'refused') {
      refused = { value: sent };
      update({ state: 'error', message: result.message });
    } else {
      isOutdated = true;
      update({ state: 'error', message: result.message });
      onConflict();
    }
  }

  function receive(next: Saved<Value>) {
    const wasOutdated = isOutdated;
    const isOwn = unanswered !== null && isEqual(next.value, unanswered.value);
    if (isEqual(next.value, value)) {
      // What the user wants, whoever saved it.
      base = next;
      unanswered = null;
      isOutdated = false;
      const isDone = wasOutdated || isOwn || snapshot.conflict !== null;
      update({ conflict: null, ...(isDone && { state: 'saved', message: undefined }) });
    } else if (isEqual(next.value, base.value) || isOwn) {
      // Unchanged, or the answer to an own request got lost.
      base = next;
      if (isOwn) unanswered = null;
      isOutdated = false;
      if (wasOutdated) update({ state: 'idle', message: undefined });
      if (wasOutdated || isOwn) schedule(0);
    } else if (!isDirty()) {
      base = next;
      value = next.value;
      isOutdated = false;
      update({ state: 'idle', message: undefined, conflict: null });
    } else {
      isOutdated = false;
      update({ state: 'error', message: undefined, conflict: next });
    }
  }

  const saver = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setSave(next: typeof save) {
      save = next;
    },
    /** What the user entered. */
    change(next: Value) {
      if (isEqual(next, value)) return;
      value = next;
      clearTimeout(timer);
      const keepsState = isSending || isOutdated || snapshot.conflict !== null;
      update(keepsState ? {} : { state: 'idle', message: undefined });
      if (!isSending && !isBlocked() && isDirty()) schedule(delay);
    },
    /** What the server has now. */
    setSaved(next: Saved<Value>) {
      if (isSending) waiting = next;
      else if (next.version !== base.version || !isEqual(next.value, base.value) || isOutdated) {
        receive(next);
      }
    },
    /** Without waiting: leaving the field, Enter, another tab. */
    flush: () => void run(),
    /** The user wants it, e.g. after signing in again. */
    retry() {
      refused = null;
      void run();
    },
    /** The user decided which of the two counts. */
    resolveConflict(choice: 'own' | 'saved') {
      if (!snapshot.conflict) return;
      base = snapshot.conflict;
      unanswered = null;
      if (choice === 'saved') value = base.value;
      update({ state: 'idle', conflict: null });
      void run();
    },
    isUnsaved: () => isSending || isDirty(),
    /** Saves what can be saved. Resolves when nothing is being sent any more. */
    async settle() {
      void run();
      if (isSending) await new Promise<void>((resolve) => settled.push(resolve));
    },
    start() {
      isDisposed = false;
      openAutosavers.add(saver);
    },
    /** The last chance when the page goes, see AutosaveGuard for the rest. */
    dispose() {
      void run();
      isDisposed = true;
      clearTimeout(timer);
      openAutosavers.delete(saver);
    },
  };
  return saver;
}
