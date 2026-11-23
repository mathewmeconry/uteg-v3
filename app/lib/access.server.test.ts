import { createCompetition, errorCode, truncateTables } from '~/tests/helpers';
import {
  createDisplay,
  deleteDisplay,
  getOrCreateJudgeLinks,
  listDisplays,
  resetAllTokens,
  resetToken,
  resolveToken,
} from './access.server';
import { subscribe } from './events.server';

beforeEach(truncateTables);

describe('getOrCreateJudgeLinks', () => {
  it('has one link per ground and apparatus and stays the same', async () => {
    const { id } = await createCompetition({ grounds: 2 });
    const [links] = await Promise.all([getOrCreateJudgeLinks(id), getOrCreateJudgeLinks(id)]);
    expect(links.map(({ ground, apparatus }) => `${ground} ${apparatus}`)).toEqual(
      [1, 2].flatMap((ground) =>
        ['reck', 'boden', 'schaukelringe', 'sprung', 'barren'].map((key) => `${ground} ${key}`),
      ),
    );
    expect(await getOrCreateJudgeLinks(id)).toEqual(links);
  });

  it('uses long random tokens', async () => {
    const { id } = await createCompetition();
    const links = await getOrCreateJudgeLinks(id);
    for (const { token } of links) expect(token).toMatch(/^[\w-]{43}$/);
    expect(new Set(links.map(({ token }) => token)).size).toBe(links.length);
  });

  it('rejects an unknown competition', async () => {
    expect(await errorCode(getOrCreateJudgeLinks('nope'))).toBe('NOT_FOUND');
  });
});

describe('displays', () => {
  it('creates several per ground, lists and deletes them', async () => {
    const { id } = await createCompetition();
    const display = await createDisplay(id, 1);
    await createDisplay(id, 1);
    expect(await listDisplays(id)).toHaveLength(2);
    await deleteDisplay(id, display.id);
    expect(await listDisplays(id)).toHaveLength(1);
    expect(await resolveToken(display.token, 'DISPLAY')).toBeNull();
  });

  it.each([0, 2, 1.5])('rejects ground %s', async (ground) => {
    const { id } = await createCompetition();
    expect(await errorCode(createDisplay(id, ground))).toBe('INVALID_GROUND');
  });

  it('does not delete links of others or judge links', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const display = await createDisplay(other.id, 1);
    const [judge] = await getOrCreateJudgeLinks(id);
    expect(await errorCode(deleteDisplay(id, display.id))).toBe('NOT_FOUND');
    expect(await errorCode(deleteDisplay(id, judge.id))).toBe('NOT_FOUND');
  });
});

describe('resolveToken', () => {
  it('finds the link of the right kind', async () => {
    const { id } = await createCompetition();
    const [judge] = await getOrCreateJudgeLinks(id);
    expect(await resolveToken(judge.token, 'JUDGE')).toMatchObject({
      competitionId: id,
      ground: 1,
      apparatus: 'reck',
    });
    expect(await resolveToken(judge.token, 'DISPLAY')).toBeNull();
  });

  it.each([undefined, null, '', 'nope'])('is null for %s', async (token) => {
    const { id } = await createCompetition();
    await getOrCreateJudgeLinks(id);
    expect(await resolveToken(token, 'JUDGE')).toBeNull();
  });
});

describe('resetToken', () => {
  it('locks out the old link and tells open streams', async () => {
    const { id } = await createCompetition();
    const [judge, other] = await getOrCreateJudgeLinks(id);
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    const { token } = await resetToken(id, judge.id);
    stop();
    expect(await resolveToken(judge.token, 'JUDGE')).toBeNull();
    expect(await resolveToken(token, 'JUDGE')).toMatchObject({ id: judge.id });
    expect(await resolveToken(other.token, 'JUDGE')).not.toBeNull();
    expect(listener).toHaveBeenCalledWith('settings');
  });

  it('does not reset links of other competitions', async () => {
    const { id } = await createCompetition();
    const [link] = await getOrCreateJudgeLinks((await createCompetition()).id);
    expect(await errorCode(resetToken(id, link.id))).toBe('NOT_FOUND');
  });
});

describe('resetAllTokens', () => {
  it('replaces all tokens of one kind', async () => {
    const { id } = await createCompetition();
    const other = await getOrCreateJudgeLinks((await createCompetition()).id);
    const display = await createDisplay(id, 1);
    const before = await getOrCreateJudgeLinks(id);
    await resetAllTokens(id, 'JUDGE');
    const after = await getOrCreateJudgeLinks(id);
    expect(after.map((link) => link.id)).toEqual(before.map((link) => link.id));
    for (const { token } of before) expect(await resolveToken(token, 'JUDGE')).toBeNull();
    expect(await resolveToken(display.token, 'DISPLAY')).not.toBeNull();
    expect(await resolveToken(other[0].token, 'JUDGE')).not.toBeNull();
  });
});
