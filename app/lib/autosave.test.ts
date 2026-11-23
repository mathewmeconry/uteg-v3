import { createAutosaver, type Saved, type SaveResult } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const OFFLINE: SaveResult = { ok: false, reason: 'offline' };
const CONFLICT: SaveResult = { ok: false, reason: 'conflict' };
const REFUSED: SaveResult = { ok: false, reason: 'refused', message: 'no' };

/** A form that says "a", version 1. Empty is invalid. Nobody answers until `answer`. */
function setup() {
  const answers: ((result: SaveResult) => void)[] = [];
  const save = vi.fn(
    (_value: string, _base: Saved<string>) => new Promise<SaveResult>((r) => answers.push(r)),
  );
  const onConflict = vi.fn();
  const saver = createAutosaver({
    saved: { value: 'a', version: '1' },
    isEqual: (a, b) => a === b,
    isValid: (value) => value !== '',
    save,
    onConflict,
  });
  const answer = async (result: SaveResult = { ok: true }) => {
    answers.shift()!(result);
    await advance(0);
  };
  return {
    saver,
    answer,
    onConflict,
    /** Every request as "value base-version". */
    sent: () => save.mock.calls.map(([value, base]) => `${value} ${base.version}`),
    state: () => saver.getSnapshot().state,
    value: () => saver.getSnapshot().value,
    conflict: () => saver.getSnapshot().conflict?.value ?? null,
    server: (value: string, version: string) => saver.setSaved({ value, version }),
    async type(value: string) {
      saver.change(value);
      await advance(800);
    },
  };
}

it('saves the last value after a pause', async () => {
  const { saver, sent, answer, state } = setup();
  saver.change('b');
  await advance(799);
  saver.change('c');
  await advance(799);
  expect(sent()).toEqual([]);
  await advance(1);
  expect(sent()).toEqual(['c 1']);
  expect(state()).toBe('saving');
  await answer();
  expect(state()).toBe('saved');
  expect(saver.isUnsaved()).toBe(false);
  await advance(60_000);
  expect(sent()).toHaveLength(1);
});

it('saves at once when asked to, and only once', async () => {
  const { saver, sent, answer } = setup();
  saver.change('b');
  saver.flush();
  saver.flush();
  await answer();
  saver.flush();
  await advance(10_000);
  expect(sent()).toEqual(['b 1']);
});

it('sends one request at a time and then the last value, with the new version', async () => {
  const { saver, sent, answer, state, type } = setup();
  await type('b');
  await type('c');
  saver.flush();
  saver.change('d');
  await advance(5_000);
  expect(sent()).toEqual(['b 1']);
  await answer({ ok: true, version: '2' });
  expect(sent()).toEqual(['b 1', 'd 2']);
  expect(state()).toBe('saving');
  await answer();
  expect(state()).toBe('saved');
});

it('sends the first value again when it was restored during a request', async () => {
  const { saver, sent, answer, type } = setup();
  await type('b');
  saver.change('a');
  await answer({ ok: true, version: '2' });
  expect(sent()).toEqual(['b 1', 'a 2']);
});

it('does nothing when the saved value is restored before', async () => {
  const { saver, sent, state } = setup();
  saver.change('b');
  saver.change('a');
  await advance(10_000);
  expect(sent()).toEqual([]);
  expect(state()).toBe('idle');
});

describe('invalid values', () => {
  it('are not sent', async () => {
    const { saver, sent, type } = setup();
    await type('');
    saver.flush();
    await advance(10_000);
    expect(sent()).toEqual([]);
    expect(saver.isUnsaved()).toBe(true);
    await type('b');
    expect(sent()).toEqual(['b 1']);
  });

  it('do not look saved when an earlier value was', async () => {
    const { saver, sent, answer, state, type } = setup();
    await type('b');
    saver.change('');
    await answer();
    expect(state()).toBe('idle');
    expect(saver.isUnsaved()).toBe(true);
    await advance(10_000);
    expect(sent()).toEqual(['b 1']);
  });
});

describe('when somebody else saves', () => {
  it('an unchanged form takes it over and sends nothing', async () => {
    const { sent, value, server } = setup();
    server('x', '2');
    expect(value()).toBe('x');
    await advance(10_000);
    expect(sent()).toEqual([]);
  });

  it('the next change is based on it', async () => {
    const { sent, server, type } = setup();
    server('x', '2');
    await type('y');
    expect(sent()).toEqual(['y 2']);
  });

  it('a changed form asks and sends nothing', async () => {
    const { saver, sent, server, conflict, value } = setup();
    saver.change('b');
    server('x', '2');
    expect(conflict()).toBe('x');
    expect(value()).toBe('b');
    saver.change('c');
    saver.flush();
    await advance(60_000);
    expect(sent()).toEqual([]);
  });

  it('during a request it asks afterwards', async () => {
    const { saver, sent, answer, server, conflict, type } = setup();
    await type('b');
    saver.change('c');
    server('x', '3');
    await answer();
    expect(conflict()).toBe('x');
    expect(sent()).toEqual(['b 1']);
  });

  it('after the own save an unchanged form takes it over', async () => {
    const { answer, server, conflict, value, type } = setup();
    await type('b');
    server('x', '3');
    await answer();
    expect(conflict()).toBeNull();
    expect(value()).toBe('x');
  });

  it('the same value, there is nothing left to do', async () => {
    const { saver, sent, server, conflict } = setup();
    saver.change('b');
    server('b', '2');
    await advance(10_000);
    expect(sent()).toEqual([]);
    expect(conflict()).toBeNull();
    expect(saver.isUnsaved()).toBe(false);
  });

  it('something else of the same record, only the version is taken over', async () => {
    const { saver, sent, server } = setup();
    saver.change('b');
    server('a', '2');
    await advance(800);
    expect(sent()).toEqual(['b 2']);
  });

  it('the own save arrives with the data', async () => {
    const { sent, answer, server, state, type } = setup();
    await type('b');
    server('b', '2');
    await answer();
    expect(state()).toBe('saved');
    await type('c');
    expect(sent()).toEqual(['b 1', 'c 2']);
  });
});

describe('a conflict the server found', () => {
  it('shows what the server has as soon as it is loaded', async () => {
    const { answer, server, conflict, onConflict, sent, type } = setup();
    await type('b');
    await answer(CONFLICT);
    expect(onConflict).toHaveBeenCalledTimes(1);
    await type('c');
    expect(sent()).toEqual(['b 1']);
    server('x', '2');
    expect(conflict()).toBe('x');
  });

  it('is none when only the version is another', async () => {
    const { answer, server, conflict, sent, type } = setup();
    await type('b');
    await answer(CONFLICT);
    server('a', '2');
    await advance(0);
    expect(conflict()).toBeNull();
    expect(sent()).toEqual(['b 1', 'b 2']);
  });

  it('is resolved with the own value, which is sent', async () => {
    const { saver, server, sent, answer, conflict, state } = setup();
    saver.change('b');
    server('x', '2');
    saver.resolveConflict('own');
    expect(conflict()).toBeNull();
    expect(sent()).toEqual(['b 2']);
    await answer();
    expect(state()).toBe('saved');
  });

  it('is resolved with the saved value, nothing is sent', async () => {
    const { saver, server, sent, value } = setup();
    saver.change('b');
    server('x', '2');
    saver.resolveConflict('saved');
    expect(value()).toBe('x');
    await advance(10_000);
    expect(sent()).toEqual([]);
    expect(saver.isUnsaved()).toBe(false);
  });

  it('is based on the newest value', async () => {
    const { saver, server, sent, conflict } = setup();
    saver.change('b');
    server('x', '2');
    server('y', '3');
    expect(conflict()).toBe('y');
    saver.resolveConflict('own');
    expect(sent()).toEqual(['b 3']);
  });
});

describe('without a connection', () => {
  it('tries again until it worked', async () => {
    const { saver, sent, answer, state, type } = setup();
    await type('b');
    await answer(OFFLINE);
    expect(state()).toBe('error');
    await advance(5_000);
    await answer(OFFLINE);
    saver.flush();
    expect(sent()).toHaveLength(3);
    await answer();
    expect(state()).toBe('saved');
    await advance(10_000);
    expect(sent()).toHaveLength(3);
  });

  it('also sends the first value, as the lost request may have arrived', async () => {
    const { saver, sent, answer, type } = setup();
    await type('b');
    await answer(OFFLINE);
    saver.change('a');
    expect(saver.isUnsaved()).toBe(true);
    await advance(800);
    expect(sent()).toEqual(['b 1', 'a 1']);
    await answer();
    expect(saver.isUnsaved()).toBe(false);
  });

  it('recognises that the lost request arrived', async () => {
    const { saver, sent, answer, server, conflict, state, type } = setup();
    await type('b');
    await answer(OFFLINE);
    await advance(5_000);
    // The server has it, so the version is another.
    await answer(CONFLICT);
    server('b', '2');
    expect(conflict()).toBeNull();
    expect(state()).toBe('saved');
    expect(saver.isUnsaved()).toBe(false);
    expect(sent()).toHaveLength(2);
  });

  it('continues after a lost request that arrived', async () => {
    const { sent, answer, server, conflict, type } = setup();
    await type('b');
    await answer(OFFLINE);
    await type('c');
    await answer(CONFLICT);
    server('b', '2');
    await advance(0);
    expect(conflict()).toBeNull();
    expect(sent()).toEqual(['b 1', 'c 1', 'c 2']);
  });

  it('treats a failing save like a lost connection', async () => {
    const save = vi.fn().mockRejectedValueOnce(new TypeError()).mockResolvedValue({ ok: true });
    const saver = createAutosaver({
      saved: { value: 1 },
      isEqual: Object.is,
      isValid: () => true,
      save,
    });
    saver.change(2);
    await advance(800);
    expect(saver.getSnapshot().state).toBe('error');
    await advance(5_000);
    expect(saver.getSnapshot().state).toBe('saved');
  });
});

describe('a refused value', () => {
  it('is explained and not sent again by itself', async () => {
    const { saver, sent, answer, type } = setup();
    await type('b');
    await answer(REFUSED);
    expect(saver.getSnapshot()).toMatchObject({ state: 'error', message: 'no' });
    saver.flush();
    await advance(60_000);
    expect(sent()).toEqual(['b 1']);
    await type('c');
    expect(sent()).toEqual(['b 1', 'c 1']);
  });

  it('is sent again on request', async () => {
    const { saver, sent, answer, state, type } = setup();
    await type('b');
    await answer(REFUSED);
    saver.retry();
    expect(sent()).toEqual(['b 1', 'b 1']);
    await answer();
    expect(state()).toBe('saved');
  });

  it('does not stop what was changed meanwhile', async () => {
    const { saver, sent, answer, type } = setup();
    await type('b');
    saver.change('c');
    await answer(REFUSED);
    expect(sent()).toEqual(['b 1', 'c 1']);
  });
});

describe('when the page is left', () => {
  it('waits until everything is sent', async () => {
    const { saver, sent, answer } = setup();
    let isSettled = false;
    saver.change('b');
    const settled = saver.settle().then(() => (isSettled = true));
    saver.change('c');
    await answer({ ok: true, version: '2' });
    expect(isSettled).toBe(false);
    await answer();
    await settled;
    expect(sent()).toEqual(['b 1', 'c 2']);
    expect(saver.isUnsaved()).toBe(false);
  });

  it('does not wait for what cannot be sent', async () => {
    const { saver, type } = setup();
    await type('');
    await saver.settle();
    expect(saver.isUnsaved()).toBe(true);
  });

  it('sends what is left and does not try again', async () => {
    const { saver, sent, answer } = setup();
    saver.change('b');
    saver.dispose();
    await answer(OFFLINE);
    await advance(60_000);
    expect(sent()).toEqual(['b 1']);
  });
});
