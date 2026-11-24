import { describe, expect, it, vi } from 'vitest';
import type { StarterRow } from './starterRow';
import { createStarterUpdates, type StarterChanges, type StarterData } from './starterUpdates';

const CHUR = { id: 'chur', name: 'TV Chur', location: 'Chur' };
const BUCHS = { id: 'buchs', name: 'TV Buchs', location: 'Buchs' };
const contest = { id: 'contest' } as StarterData['contest'];
const row = (id: string, values = {}) => ({ id, club: CHUR, ...values }) as StarterRow;

function setup() {
  const updates = createStarterUpdates();
  const data: StarterData = { starters: [row('a'), row('b'), row('c')], contest, clubs: [CHUR] };
  const loadAll = vi.fn(async () => data);
  const loadSome = vi.fn(async (_contestId: string, _ids: string[]): Promise<StarterChanges> => ({
    starters: [],
    contest,
  }));
  const load = (key = 'key', signal = new AbortController().signal) =>
    updates.load(key, signal, loadAll, loadSome);
  updates.remember('key', data);
  return { updates, data, loadAll, loadSome, load };
}

describe('note', () => {
  it('ignores what the page does not show', () => {
    const { updates } = setup();
    const messages = ['grades', 'settings', 'divisions', 'starters', 'starters a', null];
    expect(messages.map(updates.note)).toEqual([false, true, true, true, true, true]);
  });
});

describe('load', () => {
  it('replaces, removes and adds the starters that changed', async () => {
    const { updates, data, loadAll, loadSome, load } = setup();
    const changed = row('a', { firstname: 'Anna' });
    const added = row('d', { club: BUCHS });
    loadSome.mockResolvedValue({ starters: [changed, added], contest });
    updates.note('starters a b');
    updates.changed(['d']);

    const result = await load();
    expect(loadSome).toHaveBeenCalledWith('contest', ['a', 'b', 'd']);
    expect(result.starters).toEqual([changed, data.starters[2], added]);
    expect(result.starters[1]).toBe(data.starters[2]);
    expect(result.clubs).toEqual([CHUR, BUCHS]);
    expect(loadAll).not.toHaveBeenCalled();
  });

  it.each(['starters', 'divisions', null])('loads everything after %s', async (message) => {
    const { updates, loadAll, loadSome, load } = setup();
    updates.note('starters a');
    updates.note(message);
    await load();
    expect(loadAll).toHaveBeenCalledOnce();
    expect(loadSome).not.toHaveBeenCalled();
  });

  it('loads everything for another contest, many changes and after leaving', async () => {
    const { updates, loadAll, loadSome, load } = setup();
    updates.note('starters a');
    await load('other');
    updates.changed(Array.from({ length: 51 }, (_, index) => String(index)));
    await load('other');
    updates.note('starters a');
    updates.forget();
    updates.changed(['a']);
    await load('other');
    expect(loadAll).toHaveBeenCalledTimes(3);
    expect(loadSome).not.toHaveBeenCalled();
  });

  it('loads everything when the changes cannot be loaded', async () => {
    const { updates, loadAll, loadSome, load } = setup();
    loadSome.mockRejectedValue(new Response(null, { status: 401 }));
    updates.note('starters a');
    await load();
    expect(loadAll).toHaveBeenCalledOnce();
  });

  it.each(['starters a', null])('makes up for one that was just aborted (%s)', async (message) => {
    const { updates, loadAll, loadSome, load } = setup();
    const first = new AbortController();
    updates.note(message);
    const aborted = load('key', first.signal);
    first.abort();
    updates.note('starters b');
    // React Router does not wait for the aborted one.
    await Promise.all([expect(aborted).rejects.toThrow(), load()]);
    if (message) expect(loadSome).toHaveBeenLastCalledWith('contest', ['a', 'b']);
    else expect(loadAll).toHaveBeenCalledTimes(2);
  });

  it('loads what changes while loading the next time', async () => {
    const { updates, loadSome, load } = setup();
    updates.note('starters a b');
    const loading = load();
    updates.note('starters b');
    await loading;
    await load();
    expect(loadSome).toHaveBeenLastCalledWith('contest', ['b']);
  });

  it('keeps newer rows when an older load answers later', async () => {
    const { updates, loadSome, load } = setup();
    const answers: ((changes: StarterChanges) => void)[] = [];
    loadSome.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    updates.note('starters a');
    // After an action, which an event does not abort.
    const older = load();
    updates.note('starters a');
    const newer = load();
    const current = row('a', { firstname: 'new' });
    answers[1]({ starters: [current], contest });
    await newer;
    answers[0]({ starters: [row('a', { firstname: 'old' })], contest });
    expect((await older).starters[0]).toBe(current);
  });

  it('makes up for an aborted load', async () => {
    const { updates, loadAll, loadSome, load } = setup();
    updates.note('starters a');
    await expect(load('key', AbortSignal.abort())).rejects.toThrow();
    updates.note('starters b');
    await load();
    expect(loadSome).toHaveBeenLastCalledWith('contest', ['a', 'b']);

    updates.note('divisions');
    await expect(load('key', AbortSignal.abort())).rejects.toThrow();
    updates.note('starters a');
    await load();
    expect(loadAll).toHaveBeenCalledTimes(2);
    expect(loadSome).toHaveBeenCalledTimes(2);
  });
});
