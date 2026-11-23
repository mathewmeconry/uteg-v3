import { toFields, type StoredGrade } from '~/lib/domain/gradeInput';
import type { GradeResult } from '~/lib/gradeRequests';
import { createDraftStore, draftKey, getSlotState, type GradedSlot } from './draftStore';

const PREFIX = 'draft:token';
const KEY = 'reck:e1';

function createStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
}

function createSlot(grade: StoredGrade | null = null): GradedSlot {
  return {
    entryId: 'e1',
    apparatus: 'reck',
    firstname: 'Anna',
    lastname: 'Frei',
    inputRule: { attempts: 1, aggregation: 'NONE' },
    grade,
  };
}

const direct = (value: number) => ({ value, attempts: [] });
const typed = (final: string) => ({ attempts: [], final });

function setup(results: GradeResult[] = [], storage = createStorage()) {
  const send = vi.fn(
    async () => results.shift() ?? ({ ok: true, savedAt: 100 } satisfies GradeResult),
  );
  const store = createDraftStore({ prefix: PREFIX, storage: () => storage, send });
  const state = (slot: GradedSlot, loadedAt = 0) => {
    const draft = store.getSnapshot().get(draftKey(slot));
    const fields = draft && !draft.confirmed ? draft.fields : toFields(slot.grade, slot.inputRule);
    return getSlotState(slot, { fields, draft, loadedAt });
  };
  return { store, storage, send, state };
}

describe('typing', () => {
  it('is stored per token, apparatus and entry and survives a reload', () => {
    const { store, storage } = setup();
    store.change(createSlot(), null, typed('9.'));
    expect([...storage.items.keys()]).toEqual(['draft:token:reck:e1']);

    const reloaded = setup([], storage);
    reloaded.store.load();
    expect(reloaded.store.getSnapshot().get(KEY)).toMatchObject({
      fields: typed('9.'),
      queued: false,
    });
  });

  it('only restores drafts of the own token', () => {
    const { store, storage } = setup();
    storage.setItem('draft:other:reck:e1', '{}');
    storage.setItem('draft:token:reck:e2', 'broken');
    store.load();
    expect(store.getSnapshot().size).toBe(0);
  });

  it('leaves nothing behind when the saved grade is typed again', () => {
    const { store, storage } = setup();
    const slot = createSlot(direct(9100));
    store.change(slot, slot.grade, typed('9.2'));
    store.change(slot, slot.grade, typed('9,1'));
    expect(store.getSnapshot().size).toBe(0);
    expect(storage.items.size).toBe(0);
  });

  it('works without storage', () => {
    const store = createDraftStore({ prefix: PREFIX, storage: () => null, send: vi.fn() });
    store.load();
    store.change(createSlot(), null, typed('9'));
    expect(store.getSnapshot().size).toBe(1);
  });
});

describe('submitting', () => {
  it('sends the grade with the one it is based on and shows it until the data has it', async () => {
    const { store, storage, send, state } = setup();
    const slot = createSlot(direct(9000));
    store.change(slot, slot.grade, typed('9,25'));
    expect(await store.submit(KEY)).toMatchObject({ ok: true });
    expect(send).toHaveBeenCalledWith({
      intent: 'save',
      entryId: 'e1',
      apparatus: 'reck',
      grade: direct(9250),
      previous: direct(9000),
    });
    expect(storage.items.size).toBe(0);
    expect(state(slot, 99)).toMatchObject({ saved: direct(9250), isDirty: false });
    // Data loaded later wins, also when the grade was deleted since.
    expect(state(createSlot(null), 100).saved).toBeNull();
    store.reconcile([slot], 99);
    expect(store.getSnapshot().size).toBe(1);
    store.reconcile([slot], 100);
    expect(store.getSnapshot().size).toBe(0);
  });

  it('keeps and repeats a grade that was not answered, also after a reload', async () => {
    const offline = { ok: false, code: 'OFFLINE' } as const;
    const { store, storage, state } = setup([offline, offline]);
    const slot = createSlot();
    store.change(slot, null, typed('9.1'));
    await store.submit(KEY);
    await store.retry();
    expect(state(slot)).toMatchObject({ isDirty: true, isFailed: true, saved: null });

    const reloaded = setup([], storage);
    reloaded.store.load();
    expect(reloaded.state(slot)).toMatchObject({ isFailed: true });
    await reloaded.store.retry();
    expect(reloaded.send).toHaveBeenCalledTimes(1);
    expect(reloaded.state(slot)).toMatchObject({ isDirty: false, saved: direct(9100) });
    expect(storage.items.size).toBe(0);
  });

  it('does not repeat what the server refused or what was only typed', async () => {
    const { store, send, state } = setup([{ ok: false, code: 'ENTRY_NOT_JUDGEABLE' }]);
    const slot = createSlot();
    store.change(slot, null, typed('9.1'));
    await store.retry();
    expect(send).not.toHaveBeenCalled();
    await store.submit(KEY);
    await store.retry();
    expect(send).toHaveBeenCalledTimes(1);
    expect(state(slot)).toMatchObject({ isDirty: true, rejected: 'ENTRY_NOT_JUDGEABLE' });
  });

  it('keeps what was typed while the save was running', async () => {
    const { store, state } = setup();
    const slot = createSlot();
    store.change(slot, null, typed('9.1'));
    const saving = store.submit(KEY);
    await Promise.resolve();
    store.change(slot, null, typed('9.15'));
    await saving;
    expect(state(createSlot(direct(9100)))).toMatchObject({ isDirty: true, isConflict: false });
    expect(store.getSnapshot().get(KEY)).toMatchObject({
      fields: typed('9.15'),
      base: direct(9100),
    });
  });

  it('sends a double tap once', async () => {
    const { store, send } = setup();
    store.change(createSlot(), null, typed('9.1'));
    await Promise.all([store.submit(KEY), store.submit(KEY)]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('forgets a grade that arrived although the answer was lost', async () => {
    const { store } = setup([{ ok: false, code: 'OFFLINE' }]);
    store.change(createSlot(), null, typed('9.1'));
    await store.submit(KEY);
    store.reconcile([createSlot(direct(9100))], 1);
    expect(store.getSnapshot().size).toBe(0);
  });
});

describe('a grade saved elsewhere', () => {
  it('is a conflict only with unsaved input', () => {
    const { store, state } = setup();
    const slot = createSlot();
    expect(state(createSlot(direct(9500))).isConflict).toBe(false);
    store.change(slot, null, typed('9.1'));
    expect(state(slot).isConflict).toBe(false);
    expect(state(createSlot(direct(9500)))).toMatchObject({
      isConflict: true,
      saved: direct(9500),
    });
    expect(state(createSlot(direct(9100))).isConflict).toBe(false);
  });

  it('can be kept or replaced', async () => {
    const { store, send, state } = setup();
    const changed = createSlot(direct(9500));
    store.change(createSlot(), null, typed('9.1'));
    store.discard(KEY);
    expect(state(changed)).toMatchObject({ isDirty: false, saved: direct(9500) });

    store.change(createSlot(), null, typed('9.1'));
    await store.overwrite(KEY, direct(9500));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ grade: direct(9100), previous: direct(9500) }),
    );
  });
});
