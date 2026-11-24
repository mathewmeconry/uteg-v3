import {
  createCompetition,
  createDivision,
  createStarter,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import { subscribe } from './events.server';
import { getDivisionLineups, moveEntriesToLineup, unassignEntries } from './lineups.server';
import { prisma } from './prisma.server';

beforeEach(truncateTables);

async function setup() {
  const competition = await createCompetition();
  const division = await createDivision(competition.contest.id);
  const entries: Record<string, string> = {};
  for (const firstname of ['a', 'b', 'c', 'd']) {
    const { entry } = await createStarter(competition.id, { firstname, divisionId: division.id });
    entries[firstname] = entry.id;
  }
  /** The names in a lineup, or the unassigned ones. */
  async function names(apparatus?: string) {
    const { lineups, unassigned } = await getDivisionLineups(competition.id, division.id);
    const list = apparatus
      ? lineups.find((lineup) => lineup.apparatus === apparatus)!.entries
      : unassigned;
    return list.map(({ starter }) => starter.firstname).join('');
  }
  const pick = (text: string) => [...text].map((name) => entries[name]);
  const reck = { divisionId: division.id, apparatus: 'reck' };
  const boden = { divisionId: division.id, apparatus: 'boden' };
  return { competition, division, names, pick, reck, boden };
}

describe('moveEntriesToLineup', () => {
  it('appends in the given order', async () => {
    const { competition, names, pick, reck } = await setup();
    await moveEntriesToLineup(competition.id, reck, pick('ca'));
    await moveEntriesToLineup(competition.id, reck, pick('b'));
    expect(await names('reck')).toBe('cab');
    expect(await names()).toBe('d');
  });

  it('moves entries that are already there to the end', async () => {
    const { competition, names, pick, reck } = await setup();
    await moveEntriesToLineup(competition.id, reck, pick('ab'));
    await moveEntriesToLineup(competition.id, reck, pick('ac'));
    expect(await names('reck')).toBe('bac');
  });

  it('moves between lineups and tells the viewers', async () => {
    const { competition, names, pick, reck, boden } = await setup();
    await moveEntriesToLineup(competition.id, reck, pick('ab'));
    const listener = vi.fn();
    const stop = subscribe(competition.id, listener);
    await moveEntriesToLineup(competition.id, boden, pick('a'));
    stop();
    expect(await names('reck')).toBe('b');
    expect(await names('boden')).toBe('a');
    expect(listener).toHaveBeenCalledWith('divisions');
  });

  it('gives concurrently added entries different places', async () => {
    const { competition, division, pick, reck } = await setup();
    await Promise.all(
      [...'abcd'].map((name) => moveEntriesToLineup(competition.id, reck, pick(name))),
    );
    const { lineups } = await getDivisionLineups(competition.id, division.id);
    const positions = lineups.flatMap(({ entries }) => entries.map(({ position }) => position));
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it('only takes entries of the division', async () => {
    const { competition, reck } = await setup();
    const other = await createStarter(competition.id);
    const move = moveEntriesToLineup(competition.id, reck, [other.entry.id]);
    expect(await errorCode(move)).toBe('ENTRY_NOT_IN_DIVISION');
  });

  it('stays within the competition', async () => {
    const { pick, reck } = await setup();
    const other = await createCompetition();
    expect(await errorCode(moveEntriesToLineup(other.id, reck, pick('a')))).toBe('NOT_FOUND');
  });

  it('only knows the apparatus of the division', async () => {
    const { competition, division, pick } = await setup();
    const barren = { divisionId: division.id, apparatus: 'barren' };
    const move = moveEntriesToLineup(competition.id, barren, pick('a'));
    expect(await errorCode(move)).toBe('NOT_FOUND');
    // Nor does the database.
    const where = { id: pick('a')[0] };
    await expect(
      prisma.entry.update({ where, data: { startApparatus: 'barren' } }),
    ).rejects.toThrow('Foreign key');
  });
});

describe('moveEntriesToLineup before another entry', () => {
  it('reorders, also while the division runs', async () => {
    const { competition, division, names, pick, reck } = await setup();
    await moveEntriesToLineup(competition.id, reck, pick('abc'));
    await prisma.division.update({ where: { id: division.id }, data: { state: 'RUNNING' } });
    await moveEntriesToLineup(competition.id, reck, pick('c'), pick('a')[0]);
    expect(await names('reck')).toBe('cab');
    await moveEntriesToLineup(competition.id, reck, pick('c'), pick('b')[0]);
    expect(await names('reck')).toBe('acb');
  });

  it('takes over entries from elsewhere in the division', async () => {
    const { competition, names, pick, reck, boden } = await setup();
    await moveEntriesToLineup(competition.id, reck, pick('ab'));
    await moveEntriesToLineup(competition.id, boden, pick('c'));
    await moveEntriesToLineup(competition.id, reck, pick('cd'), pick('b')[0]);
    expect(await names('reck')).toBe('acdb');
    expect(await names('boden')).toBe('');
  });

  it('appends when the other entry has left the lineup', async () => {
    const { competition, names, pick, reck } = await setup();
    await moveEntriesToLineup(competition.id, reck, pick('ab'));
    await moveEntriesToLineup(competition.id, reck, pick('c'), pick('d')[0]);
    expect(await names('reck')).toBe('abc');
  });
});

describe('unassignEntries', () => {
  it('keeps the division', async () => {
    const { competition, division, names, pick, reck } = await setup();
    await moveEntriesToLineup(competition.id, reck, pick('ab'));
    await unassignEntries(competition.id, division.id, pick('a'));
    expect(await names('reck')).toBe('b');
    expect(await names()).toBe('acd');
  });

  it('stays within the competition and the division', async () => {
    const { competition, division, pick } = await setup();
    const other = await createCompetition();
    const foreign = unassignEntries(other.id, division.id, pick('a'));
    expect(await errorCode(foreign)).toBe('NOT_FOUND');
    const second = await createDivision(competition.contest.id, { number: 2 });
    const mismatch = unassignEntries(competition.id, second.id, pick('a'));
    expect(await errorCode(mismatch)).toBe('ENTRY_NOT_IN_DIVISION');
  });
});

describe('getDivisionLineups', () => {
  it('orders lineups by rotation and hides withdrawn entries before the start', async () => {
    const { competition, division } = await setup();
    await createStarter(competition.id, {
      divisionId: division.id,
      startApparatus: 'reck',
      withdrawnAt: new Date(),
    });
    const { lineups } = await getDivisionLineups(competition.id, division.id);
    expect(lineups.map(({ apparatus, entries }) => [apparatus, entries.length])).toEqual([
      ['reck', 0],
      ['boden', 0],
      ['schaukelringe', 0],
      ['sprung', 0],
    ]);
  });

  it('stays within the competition', async () => {
    const { division } = await setup();
    const other = await createCompetition();
    expect(await errorCode(getDivisionLineups(other.id, division.id))).toBe('NOT_FOUND');
  });
});
