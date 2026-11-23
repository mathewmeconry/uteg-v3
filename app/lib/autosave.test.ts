import { createAutosaver, type SaveResult } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const OFFLINE: SaveResult = { ok: false, reason: 'offline' };

function setup(saved = 'a') {
  const answers: ((result: SaveResult) => void)[] = [];
  const save = vi.fn((_value: string) => new Promise<SaveResult>((r) => answers.push(r)));
  const saver = createAutosaver({ saved, isEqual: (a, b) => a === b, save });
  const answer = async (result: SaveResult = { ok: true }) => {
    answers.shift()!(result);
    await advance(0);
  };
  const sent = () => save.mock.calls.map(([value]) => value);
  return { saver, save, answer, sent, state: () => saver.getStatus().state };
}

it('saves the last value after a pause', async () => {
  const { saver, sent, answer, state } = setup();
  saver.change('b', true);
  await advance(799);
  saver.change('c', true);
  await advance(799);
  expect(sent()).toEqual([]);
  await advance(1);
  expect(sent()).toEqual(['c']);
  expect(state()).toBe('saving');
  await answer();
  expect(state()).toBe('saved');
  expect(saver.isUnsaved()).toBe(false);
  await advance(60_000);
  expect(sent()).toEqual(['c']);
});

it('saves at once when asked to, and only once', async () => {
  const { saver, sent, answer } = setup();
  saver.change('b', true);
  saver.flush();
  saver.flush();
  await answer();
  saver.flush();
  await advance(10_000);
  expect(sent()).toEqual(['b']);
});

it('sends one request at a time and then the last value', async () => {
  const { saver, sent, answer, state } = setup();
  saver.change('b', true);
  saver.flush();
  saver.change('c', true);
  saver.flush();
  saver.change('d', true);
  await advance(5_000);
  expect(sent()).toEqual(['b']);
  await answer();
  expect(sent()).toEqual(['b', 'd']);
  await answer();
  expect(state()).toBe('saved');
});

it('sends the saved value again when it was restored during a request', async () => {
  const { saver, sent, answer } = setup();
  saver.change('b', true);
  saver.flush();
  saver.change('a', true);
  await answer();
  expect(sent()).toEqual(['b', 'a']);
});

it('does nothing when the saved value is restored before', async () => {
  const { saver, sent, state } = setup();
  saver.change('b', true);
  saver.change('a', true);
  await advance(10_000);
  expect(sent()).toEqual([]);
  expect(state()).toBe('idle');
});

it('does not send what is invalid', async () => {
  const { saver, sent, answer } = setup();
  saver.change('', false);
  saver.flush();
  await advance(10_000);
  expect(sent()).toEqual([]);
  expect(saver.isUnsaved()).toBe(true);
  saver.change('b', true);
  await advance(800);
  await answer();
  expect(sent()).toEqual(['b']);
});

it('waits when it becomes invalid before it is sent', async () => {
  const { saver, sent } = setup();
  saver.change('b', true);
  saver.change('', false);
  await advance(10_000);
  expect(sent()).toEqual([]);
});

describe('without a connection', () => {
  it('tries again until it worked', async () => {
    const { saver, sent, answer, state } = setup();
    saver.change('b', true);
    await advance(800);
    await answer(OFFLINE);
    expect(state()).toBe('error');
    await advance(5_000);
    await answer(OFFLINE);
    saver.flush();
    expect(sent()).toEqual(['b', 'b', 'b']);
    await answer();
    expect(state()).toBe('saved');
    await advance(10_000);
    expect(sent()).toHaveLength(3);
  });

  it('also sends the saved value, as the lost request may have arrived', async () => {
    const { saver, sent, answer } = setup();
    saver.change('b', true);
    saver.flush();
    await answer(OFFLINE);
    saver.change('a', true);
    expect(saver.isUnsaved()).toBe(true);
    await advance(800);
    expect(sent()).toEqual(['b', 'a']);
    await answer();
    expect(saver.isUnsaved()).toBe(false);
  });

  it('treats a failing save like a lost connection', async () => {
    const save = vi.fn().mockRejectedValueOnce(new TypeError()).mockResolvedValue({ ok: true });
    const saver = createAutosaver({ saved: 1, isEqual: Object.is, save });
    saver.change(2, true);
    await advance(800);
    expect(saver.getStatus().state).toBe('error');
    await advance(5_000);
    expect(saver.getStatus().state).toBe('saved');
  });
});

it('shows why it was refused and only sends the next change', async () => {
  const { saver, sent, answer } = setup();
  saver.change('b', true);
  saver.flush();
  await answer({ ok: false, reason: 'refused', message: 'no' });
  expect(saver.getStatus()).toEqual({ state: 'error', isConflict: false, message: 'no' });
  await advance(60_000);
  expect(sent()).toEqual(['b']);
  saver.change('c', true);
  await advance(800);
  expect(sent()).toEqual(['b', 'c']);
});

it('stops at a conflict until the user decides', async () => {
  const { saver, sent, answer } = setup();
  saver.change('b', true);
  saver.flush();
  await answer({ ok: false, reason: 'conflict' });
  saver.change('c', true);
  saver.flush();
  await advance(60_000);
  expect(sent()).toEqual(['b']);
  expect(saver.getStatus().isConflict).toBe(true);
  saver.resolveConflict('x');
  saver.flush();
  expect(sent()).toEqual(['b', 'c']);
});

it('continues from what the server has', async () => {
  const { saver, sent } = setup();
  saver.setSaved('b');
  saver.change('b', true);
  await advance(10_000);
  expect(sent()).toEqual([]);
});

describe('when the page is left', () => {
  it('sends what is left and does not try again', async () => {
    const { saver, sent, answer } = setup();
    saver.change('b', true);
    saver.dispose();
    expect(sent()).toEqual(['b']);
    await answer(OFFLINE);
    await advance(60_000);
    expect(sent()).toEqual(['b']);
  });

  it('also sends what changed during a request', async () => {
    const { saver, sent, answer } = setup();
    saver.change('b', true);
    saver.flush();
    saver.change('c', true);
    saver.dispose();
    await answer();
    expect(sent()).toEqual(['b', 'c']);
  });
});
