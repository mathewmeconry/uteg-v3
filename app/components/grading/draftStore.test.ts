import { toFields } from '~/lib/domain/gradeInput';
import type { GradeRequest, GradeResult, SavedGrade } from '~/lib/gradeRequests';
import { createDraftStore, draftKey, getSlotState, type GradedSlot } from './draftStore';

const PREFIX = 'draft:link';
const KEY = 'reck:e1';
const OFFLINE = { ok: false, code: 'OFFLINE' } as const;

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

function createSlot(grade: SavedGrade | null = null, patch: Partial<GradedSlot> = {}): GradedSlot {
  return {
    entryId: 'e1',
    apparatus: 'reck',
    firstname: 'Anna',
    lastname: 'Frei',
    withdrawn: false,
    inputRule: { attempts: 1, aggregation: 'NONE' },
    grade,
    ...patch,
  };
}

const value = (thousandths: number) => ({ value: thousandths, attempts: [] });
const saved = (thousandths: number, version = 1, requestId: string | null = null): SavedGrade => ({
  id: 'g1',
  version,
  requestId,
  ...value(thousandths),
});
const typed = (final: string) => ({ attempts: [], final });

/** Without prepared results every grade is saved. */
function setup(results: GradeResult[] = [], storage = createStorage()) {
  const requests: Extract<GradeRequest, { intent: 'save' }>[] = [];
  const send = vi.fn(async (request: GradeRequest): Promise<GradeResult> => {
    if (request.intent !== 'save') throw new Error('not expected');
    requests.push(request);
    const version = (request.previous?.version ?? 0) + 1;
    const grade = { id: 'g1', version, requestId: request.requestId, ...request.grade };
    return results.shift() ?? { ok: true, savedAt: 100, grade };
  });
  const store = createDraftStore({ prefix: PREFIX, storage: () => storage, send });
  const state = (slot: GradedSlot, loadedAt = 0) => {
    const draft = store.getSnapshot().get(draftKey(slot));
    const fields = draft && !draft.confirmed ? draft.fields : toFields(slot.grade, slot.inputRule);
    return getSlotState(slot, { fields, draft, loadedAt });
  };
  return { store, storage, send, requests, state };
}

describe('typing', () => {
  it('is stored per link, apparatus and entry and survives a reload', () => {
    const { store, storage } = setup();
    store.change(createSlot(), null, typed('9.'));
    expect([...storage.items.keys()]).toEqual(['draft:link:reck:e1']);

    const reloaded = setup([], storage);
    reloaded.store.load();
    expect(reloaded.store.getSnapshot().get(KEY)).toMatchObject({
      fields: typed('9.'),
      queued: false,
    });
  });

  it('only restores drafts of the own link', () => {
    const { store, storage } = setup();
    storage.setItem('draft:other:reck:e1', '{}');
    storage.setItem('draft:link:reck:e2', 'broken');
    store.load();
    expect(store.getSnapshot().size).toBe(0);
  });

  it('leaves nothing behind when the saved grade is typed again', () => {
    const { store, storage, state } = setup();
    const slot = createSlot(saved(9100));
    store.change(slot, slot.grade, typed('9.2'));
    store.change(slot, slot.grade, typed('9,1'));
    expect(state(slot).isDirty).toBe(false);
    expect(storage.items.size).toBe(0);
    store.leave(KEY);
    expect(store.getSnapshot().size).toBe(0);
  });

  it('is not rewritten on the way to another value', () => {
    const { store, state } = setup();
    const slot = createSlot(saved(9000));
    store.change(slot, slot.grade, typed('9'));
    store.reconcile([slot], 1);
    expect(store.getSnapshot().get(KEY)?.fields).toEqual(typed('9'));
    store.change(slot, slot.grade, typed('9.5'));
    expect(state(slot)).toMatchObject({ isDirty: true, evaluated: { grade: value(9500) } });
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
    const { store, storage, requests, state } = setup();
    const slot = createSlot(saved(9000, 3));
    store.change(slot, slot.grade, typed('9,25'));
    expect(await store.submit(KEY)).toMatchObject({ ok: true });
    expect(requests).toEqual([
      {
        intent: 'save',
        entryId: 'e1',
        apparatus: 'reck',
        grade: value(9250),
        previous: { id: 'g1', version: 3 },
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/),
        supersedes: [],
      },
    ]);
    expect(storage.items.size).toBe(0);
    expect(state(slot, 99)).toMatchObject({ saved: value(9250), isDirty: false });
    // Data loaded later wins, also when the grade was deleted since.
    expect(state(createSlot(null), 100).saved).toBeNull();
    store.reconcile([slot], 99);
    expect(store.getSnapshot().size).toBe(1);
    store.reconcile([slot], 100);
    expect(store.getSnapshot().size).toBe(0);
  });

  it('keeps and repeats a grade that was not answered, also after a reload', async () => {
    const { store, storage, requests, state } = setup([OFFLINE, OFFLINE]);
    const slot = createSlot();
    store.change(slot, null, typed('9.1'));
    await store.submit(KEY);
    await store.retry();
    expect(state(slot)).toMatchObject({ isDirty: true, isFailed: true, saved: null });

    const reloaded = setup([], storage);
    reloaded.store.load();
    expect(reloaded.state(slot)).toMatchObject({ isFailed: true, wasSent: true });
    await reloaded.store.retry();
    expect(reloaded.requests[0].requestId).toBe(requests[0].requestId);
    expect(requests[1].requestId).toBe(requests[0].requestId);
    expect(reloaded.state(slot)).toMatchObject({ isDirty: false, saved: value(9100) });
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
    expect(state(slot)).toMatchObject({
      isDirty: true,
      wasSent: false,
      rejected: 'ENTRY_NOT_JUDGEABLE',
    });
  });

  it('drops the refusal when the division runs again', async () => {
    const { store, state } = setup([{ ok: false, code: 'ENTRY_NOT_JUDGEABLE' }]);
    const slot = createSlot();
    store.change(slot, null, typed('9.1'));
    await store.submit(KEY);
    store.reconcile([], 1);
    expect(state(slot).rejected).toBe('ENTRY_NOT_JUDGEABLE');
    store.reconcile([slot], 2);
    expect(state(slot)).toMatchObject({ rejected: null, isDirty: true });
  });

  it('keeps the refusal of a withdrawn starter until it is added again', async () => {
    const { store, state } = setup([{ ok: false, code: 'ENTRY_WITHDRAWN' }]);
    const slot = createSlot();
    store.change(slot, null, typed('9.1'));
    await store.submit(KEY);
    store.reconcile([createSlot(null, { withdrawn: true })], 1);
    expect(state(slot).rejected).toBe('ENTRY_WITHDRAWN');
    store.reconcile([slot], 2);
    expect(state(slot).rejected).toBeNull();
  });

  it('keeps what was typed while the save was running', async () => {
    const { store, requests, state } = setup();
    const slot = createSlot();
    store.change(slot, null, typed('9.1'));
    const saving = store.submit(KEY);
    await Promise.resolve();
    store.change(slot, null, typed('9.15'));
    await saving;
    const loaded = createSlot(saved(9100, 1, requests[0].requestId));
    expect(state(loaded)).toMatchObject({ isDirty: true, isConflict: false });
    await store.submit(KEY);
    expect(requests[1]).toMatchObject({ previous: { version: 1 }, supersedes: [] });
  });

  it('is no conflict with the next input before the data has it', async () => {
    const { store, requests, state } = setup();
    const slot = createSlot();
    store.change(slot, null, typed('9'));
    await store.submit(KEY);
    const before = state(slot, 99).saved;
    store.change(slot, before, typed('9.5'));
    store.reconcile([slot], 99);
    expect(state(slot, 99)).toMatchObject({ isConflict: false, saved: value(9000) });
    await store.submit(KEY);
    expect(requests[1]).toMatchObject({ grade: value(9500), previous: { version: 1 } });
  });

  it('sends a double tap once', async () => {
    const { store, send } = setup();
    store.change(createSlot(), null, typed('9.1'));
    await Promise.all([store.submit(KEY), store.submit(KEY)]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('an unanswered request', () => {
  it('is replaced by going back to the saved grade, not forgotten', async () => {
    const { store, storage, requests, state } = setup([OFFLINE]);
    const slot = createSlot(saved(8500, 3));
    store.change(slot, slot.grade, typed('9'));
    await store.submit(KEY);
    store.change(slot, slot.grade, typed('8.5'));
    expect(state(slot)).toMatchObject({ isDirty: true, wasSent: true, isConflict: false });

    const reloaded = setup([], storage);
    reloaded.store.load();
    reloaded.store.reconcile([slot], 1);
    expect(reloaded.state(slot)).toMatchObject({ isDirty: true, wasSent: true });
    await reloaded.store.submit(KEY);
    expect(reloaded.requests[0]).toMatchObject({
      grade: value(8500),
      previous: { version: 3 },
      supersedes: [requests[0].requestId],
    });
    expect(reloaded.state(slot).isDirty).toBe(false);
  });

  it('is kept when the field is emptied', async () => {
    const { store, state } = setup([OFFLINE]);
    const slot = createSlot();
    store.change(slot, null, typed('9'));
    await store.submit(KEY);
    store.change(slot, null, typed(''));
    expect(state(slot)).toMatchObject({ isDirty: true, wasSent: true });
  });

  it('is done when the data shows that it arrived', async () => {
    const { store, requests } = setup([OFFLINE]);
    store.change(createSlot(), null, typed('9.1'));
    await store.submit(KEY);
    // Someone else saved the same: the own request may still arrive.
    store.reconcile([createSlot(saved(9100, 1, 'other'))], 1);
    expect(store.getSnapshot().size).toBe(1);
    store.reconcile([createSlot(saved(9100, 1, requests[0].requestId))], 2);
    expect(store.getSnapshot().size).toBe(0);
  });

  it('that arrived is no conflict with the own newer input', async () => {
    const { store, requests, state } = setup([OFFLINE]);
    store.change(createSlot(), null, typed('9'));
    await store.submit(KEY);
    store.change(createSlot(), null, typed('8.7'));
    const arrived = createSlot(saved(9000, 1, requests[0].requestId));
    expect(state(arrived).isConflict).toBe(false);
    store.reconcile([arrived], 1);
    expect(state(arrived)).toMatchObject({ isConflict: false, isDirty: true, wasSent: false });
    await store.submit(KEY);
    expect(requests[1]).toMatchObject({ previous: { version: 1 }, supersedes: [] });
  });
});

describe('a grade saved elsewhere', () => {
  it('is a conflict only with unsaved input', () => {
    const { store, state } = setup();
    const slot = createSlot();
    expect(state(createSlot(saved(9500))).isConflict).toBe(false);
    store.change(slot, null, typed('9.1'));
    expect(state(slot).isConflict).toBe(false);
    expect(state(createSlot(saved(9500)))).toMatchObject({
      isConflict: true,
      saved: value(9500),
    });
    expect(state(createSlot(saved(9100))).isConflict).toBe(false);
  });

  it('with the same value as before is no conflict', async () => {
    const { store, requests, state } = setup();
    const slot = createSlot(saved(9000, 1));
    store.change(slot, slot.grade, typed('9.1'));
    const again = createSlot(saved(9000, 2));
    expect(state(again).isConflict).toBe(false);
    store.reconcile([again], 1);
    await store.submit(KEY);
    expect(requests[0].previous).toEqual({ id: 'g1', version: 2 });
  });

  it('can be kept or replaced', async () => {
    const { store, requests, state } = setup();
    const changed = createSlot(saved(9500, 4));
    store.change(createSlot(), null, typed('9.1'));
    store.discard(KEY);
    expect(state(changed)).toMatchObject({ isDirty: false, saved: value(9500) });

    store.change(createSlot(), null, typed('9.1'));
    await store.overwrite(KEY, saved(9500, 4));
    expect(requests).toMatchObject([{ grade: value(9100), previous: { version: 4 } }]);
  });
});
