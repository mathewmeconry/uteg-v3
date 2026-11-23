import {
  createClub,
  createCompetition,
  createDivision,
  createStarter as createTestStarter,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import { subscribe } from './events.server';
import { confirmRound, saveGrades } from './judging.server';
import { lockAthletes } from './locks.server';
import { prisma } from './prisma.server';
import { getRanking } from './ranking.server';
import {
  assignEntries,
  createStarter,
  findClubConflicts,
  getStarter,
  importStarters,
  listStarters,
  updateStarter,
  withdrawStarters,
} from './starters.server';

beforeEach(truncateTables);

const ANNA = {
  firstname: 'Anna',
  lastname: 'Muster',
  birthYear: 2010,
  sex: 'FEMALE',
} as const;

async function setup() {
  const competition = await createCompetition();
  const club = await createClub();
  const contestId = competition.contest.id;
  const add = (data: object = {}) =>
    createStarter(competition.id, { ...ANNA, clubId: club.id, ...data });
  return { ...competition, contestId, club, add };
}

const athletes = () => prisma.athlete.findMany({ orderBy: { id: 'asc' } });

describe('createStarter', () => {
  it('creates a starter, its athlete and the entry', async () => {
    const { id, contestId, club, add } = await setup();
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    const { starterId, outcome } = await add({
      firstname: ' Anna ',
      stvId: ' 123 ',
      entries: [{ contestId, category: 'K5' }],
    });
    stop();
    expect(outcome).toBe('created');
    expect(await getStarter(id, starterId)).toMatchObject({
      firstname: 'Anna',
      club: { id: club.id },
      athlete: { ...ANNA, stvId: '123' },
      differsFromAthlete: false,
      entries: [{ contestId, category: 'K5', divisionId: null }],
    });
    expect(listener).toHaveBeenCalledWith('starters');
  });

  it.each([undefined, null, '', '  '])('needs no STV-ID (%j)', async (stvId) => {
    const { add } = await setup();
    await add({ stvId });
    await add({ stvId, firstname: 'Bea' });
    expect((await athletes()).map((athlete) => athlete.stvId)).toEqual([null, null]);
  });

  it.each([
    { firstname: ' ' },
    { lastname: '' },
    { birthYear: 10 },
    { birthYear: NaN },
    { sex: 'X' },
  ])('rejects %j', async (data) => {
    const { add } = await setup();
    expect(await errorCode(add(data))).toBe('INVALID_INPUT');
  });

  it('rejects an unknown club, competition and contest', async () => {
    const { add, club } = await setup();
    const other = await createCompetition();
    expect(await errorCode(add({ clubId: 'nope' }))).toBe('NOT_FOUND');
    const unknown = createStarter('nope', { ...ANNA, clubId: club.id });
    expect(await errorCode(unknown)).toBe('NOT_FOUND');
    const foreign = add({ entries: [{ contestId: other.contest.id }] });
    expect(await errorCode(foreign)).toBe('NOT_FOUND');
    expect(await prisma.starter.count()).toBe(0);
    expect(await athletes()).toEqual([]);
  });

  describe('matching the athlete', () => {
    /** Adds someone in another competition, then Anna here. */
    async function match(first: object, second: object) {
      const there = await setup();
      const here = await setup();
      const a = await there.add(first);
      const b = await here.add(second);
      const [x, y] = await prisma.starter.findMany({
        where: { id: { in: [a.starterId, b.starterId] } },
      });
      return x.athleteId === y.athleteId;
    }

    it.each([
      {},
      { firstname: 'ANNA', lastname: 'Married' },
      { lastname: 'muster', birthYear: 2011 },
    ])('takes the owner of the STV-ID for %j', async (data) => {
      expect(await match({ stvId: '1' }, { stvId: ' 1 ', ...data })).toBe(true);
    });

    it.each([{ firstname: 'Beat' }, { sex: 'MALE' }, { lastname: 'Married', birthYear: 2011 }])(
      'rejects the STV-ID of somebody else (%j)',
      async (data) => {
        await (await setup()).add({ stvId: '1' });
        const { id, add } = await setup();
        expect(await errorCode(add({ stvId: '1', ...data }))).toBe('STV_ID_CONFLICT');
        expect(await listStarters(id)).toEqual([]);
        expect(await athletes()).toMatchObject([ANNA]);
      },
    );

    it('does not hand the grades of a removed starter to somebody else', async () => {
      const { id, contestId, add } = await setup();
      const division = await createDivision(contestId, { state: 'ENDED' });
      const removed = await createTestStarter(id, {
        stvId: '1',
        firstname: 'Xenia',
        divisionId: division.id,
        lineupId: division.lineup('reck'),
        grades: { reck: 9000 },
      });
      await withdrawStarters(id, [removed.id]);
      const typo = add({ stvId: '1', entries: [{ contestId, category: 'K5' }] });
      expect(await errorCode(typo)).toBe('STV_ID_CONFLICT');
      const ranking = await getRanking(id, contestId, { category: 'K5', sex: 'FEMALE' });
      expect(ranking.entries).toEqual([]);
    });

    it('takes a picked athlete with its STV-ID, whatever the name', async () => {
      await (await setup()).add({ stvId: '1' });
      const [{ id: athleteId }] = await athletes();
      await (await setup()).add({ athleteId, stvId: '1', firstname: 'Änni', birthYear: 2011 });
      expect(await athletes()).toHaveLength(1);
    });

    it('takes the same name in any case, birth year and sex', async () => {
      expect(await match({}, { firstname: 'ANNA', lastname: 'muster' })).toBe(true);
    });

    it.each([
      { firstname: 'Anne' },
      { firstname: 'A_na' },
      { lastname: 'Muster%' },
      { birthYear: 2011 },
      { sex: 'MALE' },
    ])('does not take somebody else (%j)', async (data) => {
      expect(await match({}, data)).toBe(false);
    });

    it('treats different STV-IDs as different people', async () => {
      expect(await match({ stvId: '1' }, { stvId: '2' })).toBe(false);
    });

    it('matches the name when only one has an STV-ID and keeps it', async () => {
      expect(await match({ stvId: '1' }, {})).toBe(true);
      expect(await athletes()).toMatchObject([{ stvId: '1' }]);
    });

    it('fills in a missing STV-ID', async () => {
      expect(await match({}, { stvId: '1' })).toBe(true);
      expect(await athletes()).toMatchObject([{ stvId: '1' }]);
    });

    it('creates a new athlete when several match', async () => {
      await (await setup()).add({ stvId: '1' });
      await (await setup()).add({ stvId: '2' });
      await (await setup()).add();
      expect(await athletes()).toHaveLength(3);
    });

    it('prefers a match that already starts in the competition', async () => {
      const { add } = await setup();
      await add({ stvId: '1' });
      await (await setup()).add({ stvId: '2' });
      expect(await add()).toMatchObject({ outcome: 'existing' });
    });

    it('takes the picked athlete and keeps the entered values to the competition', async () => {
      const there = await setup();
      const first = await there.add({ stvId: '1' });
      const { athleteId } = await prisma.starter.findFirstOrThrow();
      const here = await setup();
      const { starterId } = await here.add({ athleteId, firstname: 'Änni', birthYear: 2011 });
      expect(await getStarter(here.id, starterId)).toMatchObject({
        firstname: 'Änni',
        birthYear: 2011,
        athlete: { id: athleteId, ...ANNA, stvId: '1' },
        differsFromAthlete: true,
      });
      expect(await getStarter(there.id, first.starterId)).toMatchObject(ANNA);
    });

    it('sets the missing STV-ID of a picked athlete', async () => {
      await (await setup()).add();
      const [{ id: athleteId }] = await athletes();
      await (await setup()).add({ athleteId, firstname: 'Änni', stvId: '7' });
      expect(await athletes()).toMatchObject([{ stvId: '7', firstname: 'Anna' }]);
    });

    it('rejects a picked athlete that is unknown or has another STV-ID', async () => {
      await (await setup()).add({ stvId: '1' });
      await (await setup()).add({ stvId: '2', firstname: 'Bea' });
      const [{ id: athleteId }] = await athletes();
      const { add } = await setup();
      expect(await errorCode(add({ athleteId: 'nope' }))).toBe('NOT_FOUND');
      expect(await errorCode(add({ athleteId, stvId: '3' }))).toBe('STV_ID_CONFLICT');
      expect(await errorCode(add({ athleteId, stvId: '2' }))).toBe('STV_ID_CONFLICT');
    });

    it('creates one athlete when several competitions add the person at once', async () => {
      const competitions = await Promise.all([setup(), setup(), setup()]);
      await Promise.all(competitions.map(({ add }) => add({ stvId: '1' })));
      await Promise.all(competitions.map(({ add }) => add({ firstname: 'Bea' })));
      expect(await athletes()).toHaveLength(2);
    });

    it('does not crash when an STV-ID is set in two places at once', async () => {
      const [one, two] = await Promise.all([setup(), setup()]);
      await one.add();
      const [{ id }] = await prisma.starter.findMany();
      const results = await Promise.allSettled([
        updateStarter(one.id, id, { stvId: '1' }),
        two.add({ stvId: '1', firstname: 'Bea' }),
      ]);
      const failures = results.filter((result) => result.status === 'rejected');
      expect(failures).toMatchObject([{ reason: { code: 'STV_ID_CONFLICT' } }]);
      expect(await prisma.athlete.count({ where: { stvId: '1' } })).toBe(1);
    });
  });

  it('reuses an active starter and only changes the club and the given entry', async () => {
    const { id, contestId, add } = await setup();
    const division = await createDivision(contestId);
    const first = await add({ entries: [{ contestId, category: 'K5', divisionId: division.id }] });
    const club = await createClub();
    const again = await add({
      firstname: 'ANNA',
      clubId: club.id,
      entries: [{ contestId, category: 'K5' }],
    });
    expect(again).toEqual({ starterId: first.starterId, outcome: 'existing' });
    expect(await getStarter(id, first.starterId)).toMatchObject({
      firstname: 'Anna',
      clubId: club.id,
      entries: [{ divisionId: division.id }],
    });
  });

  it('creates one starter when added twice at once', async () => {
    const { add } = await setup();
    const results = await Promise.all([add(), add(), add()]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual([
      'created',
      'existing',
      'existing',
    ]);
  });

  it('restores a removed starter with its entries, taking the new values', async () => {
    const { id, contestId, add } = await setup();
    const division = await createDivision(contestId);
    const { starterId } = await add({
      stvId: '1',
      entries: [
        {
          contestId,
          category: 'K5',
          divisionId: division.id,
          lineupId: division.lineup('reck'),
        },
      ],
    });
    await withdrawStarters(id, [starterId]);
    expect(await listStarters(id)).toEqual([]);

    expect(await add({ stvId: '1', lastname: 'Married' })).toEqual({
      starterId,
      outcome: 'restored',
    });
    expect(await getStarter(id, starterId)).toMatchObject({
      lastname: 'Married',
      differsFromAthlete: true,
      entries: [{ withdrawnAt: null, lineupId: division.lineup('reck') }],
    });
  });

  it('restores with another sex without leaving the entry in a foreign division', async () => {
    const { id, contestId, add } = await setup();
    const division = await createDivision(contestId);
    const { starterId } = await add({
      stvId: '1',
      entries: [{ contestId, category: 'K5', divisionId: division.id }],
    });
    await withdrawStarters(id, [starterId]);
    const [{ id: athleteId }] = await athletes();
    await add({ athleteId, sex: 'MALE' });
    expect(await getStarter(id, starterId)).toMatchObject({
      entries: [{ category: 'K5', divisionId: null }],
    });
  });
});

describe('listStarters', () => {
  it('has club, athlete and entries of the active starters only', async () => {
    const competition = await setup();
    await competition.add({ entries: [{ contestId: competition.contestId, category: 'K5' }] });
    await (await setup()).add();
    const removed = await competition.add({ firstname: 'Bea' });
    await withdrawStarters(competition.id, [removed.starterId]);
    expect(await listStarters(competition.id)).toMatchObject([
      { firstname: 'Anna', differsFromAthlete: false, entries: [{ category: 'K5' }] },
    ]);
  });
});

describe('updateStarter', () => {
  it('changes the values of this competition only', async () => {
    const here = await setup();
    const there = await setup();
    const { starterId } = await here.add();
    const other = await there.add();
    await updateStarter(here.id, starterId, { firstname: 'Änni', birthYear: 2009 });
    expect(await getStarter(here.id, starterId)).toMatchObject({
      firstname: 'Änni',
      birthYear: 2009,
      lastname: 'Muster',
      athlete: ANNA,
      differsFromAthlete: true,
    });
    expect(await getStarter(there.id, other.starterId)).toMatchObject({
      ...ANNA,
      differsFromAthlete: false,
    });
  });

  it('also changes the athlete when told to, but never other starters', async () => {
    const here = await setup();
    const there = await setup();
    const { starterId } = await here.add();
    const other = await there.add();
    const division = await createDivision(there.contestId, { state: 'ENDED' });
    await updateStarter(there.id, other.starterId, {
      entries: [
        {
          contestId: there.contestId,
          category: 'K5',
          divisionId: division.id,
          lineupId: division.lineup('reck'),
        },
      ],
    });
    const ranking = () => getRanking(there.id, there.contestId, { category: 'K5', sex: 'FEMALE' });
    const before = await ranking();
    expect(before.entries).toHaveLength(1);

    await updateStarter(here.id, starterId, { firstname: 'Änni', updateAthlete: true });
    expect(await athletes()).toMatchObject([{ ...ANNA, firstname: 'Änni' }]);
    expect(await getStarter(here.id, starterId)).toMatchObject({ differsFromAthlete: false });
    expect(await getStarter(there.id, other.starterId)).toMatchObject({
      ...ANNA,
      differsFromAthlete: true,
    });
    expect(await ranking()).toEqual(before);
  });

  it('rejects invalid values and other competitions', async () => {
    const here = await setup();
    const other = await setup();
    const { starterId } = await here.add();
    const update = (data: object) => errorCode(updateStarter(here.id, starterId, data));
    expect(await update({ firstname: '' })).toBe('INVALID_INPUT');
    expect(await update({ clubId: 'nope' })).toBe('NOT_FOUND');
    expect(await errorCode(updateStarter(other.id, starterId, {}))).toBe('NOT_FOUND');
  });

  it('does not change removed starters', async () => {
    const { id, add } = await setup();
    const { starterId } = await add();
    await withdrawStarters(id, [starterId]);
    expect(await errorCode(updateStarter(id, starterId, { firstname: 'X' }))).toBe('NOT_FOUND');
  });

  describe('editing the STV-ID', () => {
    async function shared(stvId: string | null) {
      const here = await setup();
      const there = await setup();
      const { starterId } = await here.add({ stvId });
      const other = await there.add({ stvId });
      const edit = (value: string | null | undefined, data: object = {}) =>
        updateStarter(here.id, starterId, { stvId: value, ...data });
      const stvIds = async () => [
        (await getStarter(here.id, starterId)).athlete.stvId,
        (await getStarter(there.id, other.starterId)).athlete.stvId,
      ];
      return { here, there, starterId, edit, stvIds };
    }

    it('keeps it when not given', async () => {
      const { edit, stvIds } = await shared('1');
      await edit(undefined);
      expect(await stvIds()).toEqual(['1', '1']);
    });

    it('sets a missing one, also on a shared athlete', async () => {
      const { edit, stvIds } = await shared(null);
      await edit(' 5 ');
      expect(await stvIds()).toEqual(['5', '5']);
    });

    it('moves to a new athlete when the old one is shared', async () => {
      const { edit, stvIds } = await shared('1');
      await edit('5', { firstname: 'Änni' });
      expect(await stvIds()).toEqual(['5', '1']);
      expect(await athletes()).toMatchObject([
        { stvId: '1', firstname: 'Anna' },
        { stvId: '5', firstname: 'Änni' },
      ]);
    });

    it('changes it in place when the athlete starts nowhere else', async () => {
      const { id, add } = await setup();
      const { starterId } = await add({ stvId: '1' });
      await updateStarter(id, starterId, { stvId: '5' });
      expect(await athletes()).toMatchObject([{ stvId: '5' }]);
    });

    it('moves to the owner of the STV-ID', async () => {
      const { edit, stvIds } = await shared('1');
      await (await setup()).add({ lastname: 'Married', stvId: '5' });
      await edit('5');
      expect(await stvIds()).toEqual(['5', '1']);
      expect(await athletes()).toHaveLength(2);
    });

    it('rejects an owner that is somebody else and never changes it', async () => {
      const { edit, stvIds } = await shared('1');
      await (await setup()).add({ firstname: 'Beat', sex: 'MALE', stvId: '5' });
      expect(await errorCode(edit('5', { updateAthlete: true }))).toBe('STV_ID_CONFLICT');
      expect(await stvIds()).toEqual(['1', '1']);
      expect(await athletes()).toMatchObject([
        { firstname: 'Anna' },
        { firstname: 'Beat', sex: 'MALE', stvId: '5' },
      ]);
    });

    it('compares the owner with the edited values', async () => {
      const { edit, stvIds } = await shared('1');
      await (await setup()).add({ firstname: 'Bea', stvId: '5' });
      await edit('5', { firstname: 'Bea' });
      expect(await stvIds()).toEqual(['5', '1']);
    });

    it('rejects an owner that already starts here and tells when it was removed', async () => {
      const { here, edit, stvIds } = await shared('1');
      const owner = await here.add({ lastname: 'Married', stvId: '5' });
      expect(await errorCode(edit('5'))).toBe('ATHLETE_ALREADY_STARTS');
      await withdrawStarters(here.id, [owner.starterId]);
      expect(await errorCode(edit('5'))).toBe('STARTER_REMOVED');
      expect(await stvIds()).toEqual(['1', '1']);
    });

    it('only takes turns on the athletes when it changes them', async () => {
      const { here, starterId, edit } = await shared('1');
      const division = await createDivision(here.contestId);
      const entry = await prisma.entry.create({
        data: { contestId: here.contestId, starterId, category: 'K5' },
      });
      await prisma.$transaction(async (tx) => {
        await lockAthletes(tx);
        await edit('1', { firstname: 'Änni' });
        await assignEntries(here.id, [{ entryIds: [entry.id], divisionId: division.id }]);
      });
    });

    it('does not clear it on a shared athlete', async () => {
      const { edit, stvIds } = await shared('1');
      await edit('');
      expect(await stvIds()).toEqual(['1', '1']);
    });

    it('clears it when the athlete starts nowhere else', async () => {
      const { id, add } = await setup();
      const { starterId } = await add({ stvId: '1' });
      await updateStarter(id, starterId, { stvId: null });
      expect(await athletes()).toMatchObject([{ stvId: null }]);
    });

    it('updates the athlete the starter ends up with', async () => {
      const { edit } = await shared('1');
      await edit('5', { firstname: 'Änni', updateAthlete: true });
      expect(await athletes()).toMatchObject([
        { stvId: '1', firstname: 'Anna' },
        { stvId: '5', firstname: 'Änni' },
      ]);
    });
  });

  describe('entries', () => {
    async function assigned(data: object = {}) {
      const competition = await setup();
      const { contestId } = competition;
      const division = await createDivision(contestId);
      const { starterId } = await competition.add({
        entries: [
          {
            contestId,
            category: 'K5',
            divisionId: division.id,
            lineupId: division.lineup('reck'),
          },
        ],
        ...data,
      });
      const update = (entry: object, starter: object = {}) =>
        updateStarter(competition.id, starterId, {
          ...starter,
          entries: [{ contestId, ...entry }],
        });
      const entry = async () => (await getStarter(competition.id, starterId)).entries[0];
      return { ...competition, division, starterId, update, entry };
    }

    it('keeps what is not given', async () => {
      const { division, update, entry } = await assigned();
      await update({});
      expect(await entry()).toMatchObject({
        category: 'K5',
        divisionId: division.id,
        lineupId: division.lineup('reck'),
      });
    });

    it('drops division and lineup when the category changes', async () => {
      const { update, entry } = await assigned();
      await update({ category: 'K6' });
      expect(await entry()).toMatchObject({ category: 'K6', divisionId: null, lineupId: null });
    });

    it('drops division and lineup when the sex changes', async () => {
      const { id, starterId, entry } = await assigned();
      await updateStarter(id, starterId, { sex: 'MALE' });
      expect(await entry()).toMatchObject({ category: 'K5', divisionId: null, lineupId: null });
    });

    it('drops a category the new sex does not have', async () => {
      const { id, contestId, add } = await setup();
      const { starterId } = await add({ entries: [{ contestId, category: 'KD' }] });
      await updateStarter(id, starterId, { sex: 'MALE' });
      expect(await getStarter(id, starterId)).toMatchObject({ entries: [{ category: null }] });
    });

    it('moves to another division and drops the old lineup', async () => {
      const { contestId, update, entry } = await assigned();
      const second = await createDivision(contestId, { number: 2 });
      await update({ divisionId: second.id });
      expect(await entry()).toMatchObject({ divisionId: second.id, lineupId: null });
      await update({ lineupId: second.lineup('boden') });
      expect(await entry()).toMatchObject({ lineupId: second.lineup('boden') });
    });

    it('clears division and lineup', async () => {
      const { update, entry } = await assigned();
      await update({ lineupId: null });
      expect(await entry()).toMatchObject({ divisionId: expect.any(String), lineupId: null });
      await update({ divisionId: null });
      expect(await entry()).toMatchObject({ category: 'K5', divisionId: null });
    });

    it('goes last in a new lineup', async () => {
      const { id, division, contestId, add, update, entry } = await assigned();
      const second = await add({
        firstname: 'Bea',
        entries: [
          {
            contestId,
            category: 'K5',
            divisionId: division.id,
            lineupId: division.lineup('boden'),
          },
        ],
      });
      await update({ lineupId: division.lineup('boden') });
      const [other] = (await getStarter(id, second.starterId)).entries;
      expect((await entry()).position).toBeGreaterThan(other.position);
    });

    it.each([
      ['sex', { sex: 'MALE' }],
      ['category', { category: 'K6' }],
    ] as const)('rejects a division of another %s', async (_, data) => {
      const { contestId, update } = await assigned();
      const other = await createDivision(contestId, data);
      expect(await errorCode(update({ divisionId: other.id }))).toBe('DIVISION_MISMATCH');
    });

    it('rejects a division of another contest', async () => {
      const { update } = await assigned();
      const other = await createDivision((await createCompetition()).contest.id);
      expect(await errorCode(update({ divisionId: other.id }))).toBe('NOT_FOUND');
    });

    it('rejects a lineup of another division and unknown categories', async () => {
      const { contestId, update } = await assigned();
      const second = await createDivision(contestId, { number: 2 });
      const lineup = update({ lineupId: second.lineup('reck') });
      expect(await errorCode(lineup)).toBe('LINEUP_MISMATCH');
      expect(await errorCode(update({ category: 'KH' }))).toBe('INVALID_CATEGORY');
    });

    it('changes nothing when an entry is rejected', async () => {
      const { id, starterId, update } = await assigned();
      expect(await errorCode(update({ category: 'KH' }, { firstname: 'X' }))).toBe(
        'INVALID_CATEGORY',
      );
      expect(await getStarter(id, starterId)).toMatchObject({ firstname: 'Anna' });
    });
  });
});

describe('withdrawStarters', () => {
  it('hides the starters but keeps their slots and grades', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    const starter = await createTestStarter(id, {
      divisionId: division.id,
      lineupId: division.lineup('reck'),
      grades: { reck: 9000 },
    });
    await withdrawStarters(id, [starter.id]);
    expect(await listStarters(id)).toEqual([]);
    expect(await prisma.entry.findFirst({ include: { grades: true } })).toMatchObject({
      withdrawnAt: expect.any(Date),
      lineupId: division.lineup('reck'),
      grades: [{ value: 9000 }],
    });
  });

  it('keeps the time of the first withdrawal', async () => {
    const { id } = await createCompetition();
    const starter = await createTestStarter(id);
    await withdrawStarters(id, [starter.id]);
    const before = await prisma.entry.findFirst();
    await withdrawStarters(id, [starter.id]);
    expect(await prisma.entry.findFirst()).toEqual(before);
  });

  it('stays within the competition', async () => {
    const { id } = await createCompetition();
    const other = await createTestStarter((await createCompetition()).id);
    expect(await errorCode(withdrawStarters(id, [other.id]))).toBe('NOT_FOUND');
    expect(await prisma.starter.count({ where: { deletedAt: null } })).toBe(1);
  });
});

describe('assignEntries', () => {
  it('assigns groups to their division and lineup in order', async () => {
    const { id, contest } = await createCompetition();
    const women = await createDivision(contest.id);
    const men = await createDivision(contest.id, { sex: 'MALE' });
    const a = await createTestStarter(id);
    const b = await createTestStarter(id);
    const m = await createTestStarter(id, { sex: 'MALE' });
    await assignEntries(id, [
      {
        entryIds: [b.entry.id, a.entry.id],
        divisionId: women.id,
        lineupId: women.lineup('boden'),
      },
      { entryIds: [m.entry.id], divisionId: men.id },
    ]);
    const entries = await prisma.entry.findMany({ where: { lineupId: women.lineup('boden') } });
    const position = (entryId: string) => entries.find((entry) => entry.id === entryId)!.position;
    expect(position(b.entry.id)).toBeLessThan(position(a.entry.id));
    expect(await prisma.entry.findUnique({ where: { id: m.entry.id } })).toMatchObject({
      divisionId: men.id,
      lineupId: null,
    });
  });

  it('keeps the lineup unless it is cleared', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id);
    const lineupId = division.lineup('boden');
    const { entry } = await createTestStarter(id, { divisionId: division.id, lineupId });
    const assignment = { entryIds: [entry.id], divisionId: division.id };
    const find = () => prisma.entry.findUnique({ where: { id: entry.id } });
    await assignEntries(id, [assignment]);
    expect(await find()).toMatchObject({ lineupId, position: entry.position });
    // Someone from another division does not change that.
    const old = await createDivision(contest.id, { number: 2 });
    const mover = await createTestStarter(id, {
      divisionId: old.id,
      lineupId: old.lineup('boden'),
    });
    await assignEntries(id, [{ ...assignment, entryIds: [mover.entry.id, entry.id] }]);
    expect(await find()).toMatchObject({ lineupId });
    expect(await prisma.entry.findUnique({ where: { id: mover.entry.id } })).toMatchObject({
      divisionId: division.id,
      lineupId: null,
    });
    await assignEntries(id, [{ ...assignment, lineupId: null }]);
    expect(await find()).toMatchObject({ lineupId: null });
  });

  it('assigns all or none', async () => {
    const { id, contest } = await createCompetition();
    const women = await createDivision(contest.id);
    const a = await createTestStarter(id);
    const m = await createTestStarter(id, { sex: 'MALE' });
    const assign = assignEntries(id, [
      { entryIds: [a.entry.id, m.entry.id], divisionId: women.id },
    ]);
    expect(await errorCode(assign)).toBe('DIVISION_MISMATCH');
    expect(await prisma.entry.count({ where: { divisionId: women.id } })).toBe(0);
  });

  it('rejects entries of other competitions and removed starters', async () => {
    const { id, contest } = await createCompetition();
    const { id: divisionId } = await createDivision(contest.id);
    const other = await createTestStarter((await createCompetition()).id);
    const foreign = assignEntries(id, [{ entryIds: [other.entry.id], divisionId }]);
    expect(await errorCode(foreign)).toBe('NOT_FOUND');
    const removed = await createTestStarter(id);
    await withdrawStarters(id, [removed.id]);
    const assign = assignEntries(id, [{ entryIds: [removed.entry.id], divisionId }]);
    expect(await errorCode(assign)).toBe('ENTRY_WITHDRAWN');
  });
});

describe('importStarters', () => {
  async function setupImport() {
    const competition = await setup();
    const run = (rows: object[]) =>
      importStarters(competition.id, {
        contestId: competition.contestId,
        clubId: competition.club.id,
        rows: rows.map((row) => ({ ...ANNA, ...row })),
      });
    return { ...competition, run };
  }

  it('creates starters with category and division', async () => {
    const { id, contestId, run } = await setupImport();
    const division = await createDivision(contestId, { number: 2 });
    const result = await run([
      { stvId: ' ', category: 'K5', divisionNumber: 2 },
      { firstname: 'Bea', stvId: '5', category: 'K6' },
      { firstname: 'Carla' },
    ]);
    expect(result).toMatchObject({ created: 3, restored: 0, existing: 0, failures: [] });
    const starters = await listStarters(id);
    const entry = (firstname: string) =>
      starters.find((starter) => starter.firstname === firstname)!.entries[0];
    expect(entry('Anna')).toMatchObject({ category: 'K5', divisionId: division.id });
    expect(entry('Bea')).toMatchObject({ category: 'K6', divisionId: null });
    expect(entry('Carla')).toMatchObject({ category: null, divisionId: null });
  });

  it('ignores divisions that do not exist', async () => {
    const { contestId, run } = await setupImport();
    await createDivision(contestId, { sex: 'MALE', number: 1 });
    const result = await run([
      { category: 'K5', divisionNumber: 1 },
      { firstname: 'Bea', divisionNumber: 1 },
    ]);
    expect(result).toMatchObject({ created: 2, failures: [] });
  });

  it('imports the other rows when some fail', async () => {
    const { id, run } = await setupImport();
    const result = await run([
      { firstname: '' },
      { firstname: 'Bea' },
      { firstname: 'Carla', category: 'KH' },
      { firstname: 'Dora', athleteId: 'nope' },
      { firstname: 'Eva', sex: undefined },
      { firstname: 'Fay' },
    ]);
    expect(result).toMatchObject({
      created: 2,
      restored: 0,
      existing: 0,
      failures: [
        { index: 0, code: 'INVALID_INPUT' },
        { index: 2, code: 'INVALID_CATEGORY' },
        { index: 3, code: 'NOT_FOUND' },
        { index: 4, code: 'INVALID_INPUT' },
      ],
    });
    expect((await listStarters(id)).map(({ firstname }) => firstname)).toEqual(['Bea', 'Fay']);
    // A failed row leaves no athlete behind.
    expect(await athletes()).toHaveLength(2);
  });

  it('reuses and restores on a second import', async () => {
    const { id, contestId, run } = await setupImport();
    const division = await createDivision(contestId);
    await run([{ category: 'K5', divisionNumber: 1 }, { firstname: 'Bea' }]);
    const bea = (await listStarters(id)).find(({ firstname }) => firstname === 'Bea')!;
    await withdrawStarters(id, [bea.id]);
    const result = await run([{}, { firstname: 'Bea' }, { firstname: 'Bea' }]);
    expect(result).toMatchObject({ created: 0, restored: 1, existing: 2, failures: [] });
    expect((await listStarters(id))[0].entries[0]).toMatchObject({ divisionId: division.id });
  });

  describe('of starters with another club', () => {
    async function setupClubs() {
      const competition = await setupImport();
      const { id, contestId, club, run } = competition;
      await run([{}, { firstname: 'Bea' }, { firstname: 'Carla' }]);
      const starters = await listStarters(id);
      const idOf = (firstname: string) =>
        starters.find((starter) => starter.firstname === firstname)!.id;
      await withdrawStarters(id, [idOf('Carla')]);
      const other = await createClub();
      const input = {
        contestId,
        clubId: other.id,
        rows: [
          { ...ANNA, category: 'K6' },
          { ...ANNA, firstname: 'bea' },
          { ...ANNA, firstname: 'Carla' },
          { ...ANNA, firstname: 'Dora' },
        ],
      };
      const clubs = async () =>
        Object.fromEntries(
          (await listStarters(id)).map(({ firstname, clubId }) => [
            firstname,
            clubId === club.id ? 'old' : clubId === other.id ? 'new' : clubId,
          ]),
        );
      return { ...competition, other, idOf, input, clubs };
    }

    const change = (starterId: string, fromClubId: string) => ({
      starterId,
      fromClubId,
      change: true,
    });

    it('keeps the club by default, but not of restored starters', async () => {
      const { id, input, clubs } = await setupClubs();
      expect(await importStarters(id, input)).toMatchObject({
        created: 1,
        restored: 1,
        existing: 2,
        clubsChanged: 0,
        clubsKept: 2,
      });
      expect(await clubs()).toEqual({ Anna: 'old', Bea: 'old', Carla: 'new', Dora: 'new' });
      expect((await listStarters(id))[0].entries[0]).toMatchObject({ category: 'K6' });
    });

    it('changes the club of the given starters', async () => {
      const { id, club, idOf, input, clubs } = await setupClubs();
      const rows = [...input.rows, ...input.rows];
      expect(
        await importStarters(id, { ...input, rows, clubAnswers: [change(idOf('Bea'), club.id)] }),
      ).toMatchObject({ clubsChanged: 1, clubsKept: 1, clubsOutdated: [] });
      expect(await clubs()).toEqual({ Anna: 'old', Bea: 'new', Carla: 'new', Dora: 'new' });
    });

    it('ignores ids of starters that no row matches', async () => {
      const { id, club, idOf, input } = await setupClubs();
      const foreign = await (await setup()).add();
      await importStarters(id, {
        ...input,
        rows: [input.rows[1]],
        clubAnswers: [idOf('Anna'), foreign.starterId, 'unknown'].map((starterId) =>
          change(starterId, club.id),
        ),
      });
      const all = await prisma.starter.findMany({ where: { clubId: input.clubId } });
      expect(all).toEqual([]);
      expect(await getStarter(id, idOf('Anna'))).toMatchObject({ clubId: club.id });
    });

    it('lists who is affected without changing anything', async () => {
      const { id, club, idOf, input } = await setupClubs();
      const snapshot = async () => [await athletes(), await prisma.starter.findMany()];
      const before = await snapshot();
      const rows = [...input.rows, { ...ANNA, stvId: '9' }, { firstname: '' }];
      const person = { lastname: 'Muster', birthYear: 2010 };
      const current = { id: club.id, name: club.name, location: club.location };
      expect(await findClubConflicts(id, { ...input, rows })).toEqual([
        { starterId: idOf('Anna'), firstname: 'Anna', ...person, club: current },
        { starterId: idOf('Bea'), firstname: 'Bea', ...person, club: current },
      ]);
      expect(await snapshot()).toEqual(before);
    });

    it('finds nobody when the clubs are the same or only start elsewhere', async () => {
      const { id, club, input } = await setupClubs();
      expect(await findClubConflicts(id, { ...input, clubId: club.id })).toEqual([]);
      const other = await createCompetition();
      expect(await findClubConflicts(other.id, input)).toEqual([]);
    });

    it('matches like the import', async () => {
      const { id, input, idOf } = await setupClubs();
      const [anna] = await athletes();
      await prisma.athlete.update({ where: { id: anna.id }, data: { stvId: '1' } });
      const rows = [
        { ...ANNA, stvId: '1' },
        { ...ANNA, stvId: '2' },
        { ...ANNA, firstname: 'Bea', birthYear: 2011 },
      ];
      const conflicts = await findClubConflicts(id, { ...input, rows });
      expect(conflicts.map(({ starterId }) => starterId)).toEqual([idOf('Anna')]);
      expect(await importStarters(id, { ...input, rows })).toMatchObject({ existing: 1 });
    });

    it('follows the answer about someone who was removed after the check', async () => {
      const { id, club, idOf, input, clubs } = await setupClubs();
      await withdrawStarters(id, [idOf('Anna'), idOf('Bea')]);
      const keep = { ...change(idOf('Anna'), club.id), change: false };
      expect(
        await importStarters(id, {
          ...input,
          clubAnswers: [keep, change(idOf('Bea'), club.id)],
        }),
      ).toMatchObject({ restored: 3, clubsKept: 1, clubsChanged: 1 });
      // Restored with the values of the row.
      expect(await clubs()).toEqual({ Anna: 'old', bea: 'new', Carla: 'new', Dora: 'new' });
    });

    it('keeps and reports a club that changed after the check', async () => {
      const { id, club, idOf, input } = await setupClubs();
      const third = await createClub();
      await updateStarter(id, idOf('Anna'), { clubId: third.id });
      await updateStarter(id, idOf('Bea'), { clubId: third.id });
      await withdrawStarters(id, [idOf('Bea')]);
      expect(
        await importStarters(id, {
          ...input,
          clubAnswers: [change(idOf('Anna'), club.id), change(idOf('Bea'), club.id)],
        }),
      ).toMatchObject({
        clubsChanged: 0,
        clubsKept: 2,
        clubsOutdated: [
          { firstname: 'Anna', lastname: 'Muster' },
          { firstname: 'bea', lastname: 'Muster' },
        ],
      });
      expect(await getStarter(id, idOf('Anna'))).toMatchObject({ clubId: third.id });
      expect(await getStarter(id, idOf('Bea'))).toMatchObject({ clubId: third.id });
    });

    it('keeps the club of someone who was added after the check', async () => {
      const { id, club, add, input } = await setupClubs();
      const conflicts = await findClubConflicts(id, input);
      const { starterId } = await add({ firstname: 'Dora' });
      await importStarters(id, {
        ...input,
        clubAnswers: conflicts.map((conflict) => change(conflict.starterId, conflict.club.id)),
      });
      expect(await getStarter(id, starterId)).toMatchObject({ clubId: club.id });
    });
  });

  it('never changes existing athletes except for a missing STV-ID', async () => {
    await (await setup()).add();
    const { run } = await setupImport();
    const [{ id: athleteId }] = await athletes();
    await run([{ athleteId, firstname: 'Änni', birthYear: 2011, stvId: '9' }]);
    expect(await athletes()).toMatchObject([{ ...ANNA, stvId: '9' }]);
  });

  it('rejects contests and clubs that do not exist', async () => {
    const { id, contestId, club } = await setupImport();
    const other = await createCompetition();
    const foreign = importStarters(id, { contestId: other.contest.id, clubId: club.id, rows: [] });
    expect(await errorCode(foreign)).toBe('NOT_FOUND');
    const noClub = importStarters(id, { contestId, clubId: 'nope', rows: [ANNA] });
    expect(await errorCode(noClub)).toBe('NOT_FOUND');
  });

  it('reports rows the database could not store', async () => {
    const { id, run } = await setupImport();
    const result = await run([
      { category: 'K5', divisionNumber: 79012345678 },
      { divisionNumber: 1.5 },
      { firstname: 'A\0b' },
      { category: 'K\0' },
      { athleteId: 'a\0' },
      { stvId: '1\0' },
      { firstname: 'Bea' },
    ]);
    expect(result.failures).toEqual(
      [0, 1, 2, 3, 4, 5].map((index) => ({ index, code: 'INVALID_INPUT' })),
    );
    expect((await listStarters(id)).map(({ firstname }) => firstname)).toEqual(['Bea']);
  });

  it('reports an STV-ID of somebody else', async () => {
    const { id, club, contestId, run } = await setupImport();
    const beat = await createTestStarter(id, { stvId: '1', firstname: 'Beat', sex: 'MALE' });
    const result = await run([{ stvId: '1', category: 'K2' }, { firstname: 'Bea' }]);
    expect(result).toMatchObject({
      created: 1,
      failures: [{ index: 0, code: 'STV_ID_CONFLICT' }],
    });
    expect(await getStarter(id, beat.id)).toMatchObject({
      clubId: beat.clubId,
      entries: [{ contestId, category: 'K5' }],
    });
    expect(club.id).not.toBe(beat.clubId);
  });

  it('handles a large file with the index of every failure', async () => {
    const { run } = await setupImport();
    const rows = Array.from({ length: 300 }, (_, i) => ({
      firstname: i === 270 ? '' : `A${i}`,
      category: 'K5',
    }));
    expect(await run(rows)).toMatchObject({
      created: 299,
      restored: 0,
      existing: 0,
      failures: [{ index: 270, code: 'INVALID_INPUT' }],
    });
    // Many queries, on a busy machine they take a while.
  }, 60_000);

  it('does not hold up judges and other competitions', async () => {
    const { id, contestId, run } = await setupImport();
    const other = await setup();
    const division = await createDivision(contestId, { state: 'RUNNING' });
    const starter = await createTestStarter(id, {
      divisionId: division.id,
      lineupId: division.lineup('reck'),
    });
    const rows = Array.from({ length: 800 }, (_, i) => ({ firstname: `A${i}`, category: 'K5' }));
    let isImporting = true;
    const job = run(rows).finally(() => (isImporting = false));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const judge = { kind: 'judge', ground: 1, apparatus: 'reck' } as const;
    await Promise.all([
      other.add(),
      saveGrades(id, [{ entryId: starter.entry.id, apparatus: 'reck', value: 9000 }], judge).then(
        () =>
          confirmRound(id, {
            ground: 1,
            apparatus: 'reck',
            round: 0,
            divisionIds: [division.id],
          }),
      ),
      ...Array.from({ length: 8 }, (_, index) => other.add({ firstname: `B${index}` })),
    ]);
    expect(isImporting).toBe(true);
    expect(await job).toMatchObject({ created: 800 });
  }, 60_000);
});
