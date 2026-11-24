import {
  createCompetition,
  createDivision,
  createStarter,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import { NAMESPACES } from '~/locales';
import { domainErrorMessage } from './domainErrors.server';
import type { DomainError } from './errors';
import { subscribe } from './events.server';
import { createI18n } from './i18n';
import {
  confirmRound,
  deleteGrade,
  getDisplayState,
  getGradingState,
  getJudgingState,
  saveGrades,
  type GradeScope,
} from './judging.server';
import { moveEntriesToLineup } from './lineups.server';
import { lockDivisions } from './locks.server';
import { prisma } from './prisma.server';

const EDITOR: GradeScope = { kind: 'editor' };
const judge = (apparatus: string, ground = 1): GradeScope => ({ kind: 'judge', ground, apparatus });
const WOMEN = ['reck', 'boden', 'schaukelringe', 'sprung'];

beforeEach(truncateTables);

type Division = Awaited<ReturnType<typeof createDivision>>;

function addStarter(
  competitionId: string,
  division: Division,
  apparatus: string,
  data: Partial<Parameters<typeof createStarter>[1]> = {},
) {
  return createStarter(competitionId, {
    category: division.category,
    sex: division.sex,
    divisionId: division.id,
    startApparatus: apparatus,
    ...data,
  });
}

async function setProgress(divisionId: string, completedRounds: number, apparatus?: string) {
  await prisma.divisionApparatus.updateMany({
    where: { divisionId, apparatus },
    data: { completedRounds },
  });
}

async function progressOf(divisionId: string) {
  const rows = await prisma.divisionApparatus.findMany({ where: { divisionId } });
  return Object.fromEntries(rows.map((row) => [row.apparatus, row.completedRounds]));
}

/** The judging state of one apparatus. */
async function tablet(competitionId: string, apparatus: string, ground = 1) {
  const state = await getJudgingState(competitionId, ground, apparatus);
  return state.apparatus[0];
}

const names = (round: { slots: { firstname: string }[] }) =>
  round.slots.map(({ firstname }) => firstname).join(' ');

describe('getJudgingState', () => {
  it('waits without running divisions', async () => {
    const { id, contest } = await createCompetition();
    await createDivision(contest.id);
    const ended = await createDivision(contest.id, { number: 2, state: 'ENDED' });
    expect(await getJudgingState(id, 1, 'reck')).toEqual({
      ground: 1,
      divisions: [],
      endedIds: [ended.id],
      apparatus: [
        { apparatus: 'reck', status: 'WAITING', currentRound: null, divisionIds: [], rounds: [] },
      ],
    });
  });

  it('has every apparatus of the competition without a filter', async () => {
    const { id } = await createCompetition();
    const { apparatus } = await getJudgingState(id, 1);
    expect(apparatus.map((item) => item.apparatus)).toEqual([...WOMEN, 'barren']);
  });

  it('lists all rounds rotated and merged with grades and input rules', async () => {
    const { id, contest } = await createCompetition();
    const k5 = await createDivision(contest.id, { state: 'RUNNING' });
    const k6 = await createDivision(contest.id, { category: 'K6', state: 'RUNNING' });
    await addStarter(id, k6, 'sprung', { firstname: 'C' });
    await addStarter(id, k5, 'sprung', { firstname: 'B', position: 2 });
    const a = await addStarter(id, k5, 'sprung', {
      firstname: 'A',
      position: 1,
      grades: { sprung: 9100, reck: 5000 },
    });
    await addStarter(id, k5, 'schaukelringe', { firstname: 'D' });

    const state = await getJudgingState(id, 1, 'sprung');
    const [sprung] = state.apparatus;
    expect(sprung).toMatchObject({ status: 'JUDGING', currentRound: 0 });
    expect(sprung.rounds.map(names)).toEqual(['A B C', 'D', '', '']);
    expect(sprung.divisionIds).toEqual([k5.id, k6.id]);
    expect(sprung.rounds[0].slots[0]).toMatchObject({
      entryId: a.entry.id,
      category: 'K5',
      withdrawn: false,
      inputRule: { attempts: 2, aggregation: 'MAX' },
      grade: { value: 9100, attempts: [] },
    });
    expect(sprung.rounds[0].slots[2].inputRule).toEqual({ attempts: 2, aggregation: 'AVG' });
    expect(sprung.rounds[0].slots[1].grade).toBeNull();

    // On the next apparatus whoever started first goes last.
    expect((await tablet(id, 'reck')).rounds.map(names)).toEqual(['', 'B C A', 'D', '']);
    expect(state.divisions).toMatchObject([
      { id: k5.id, round: 0, rounds: 4, progress: { reck: 0 } },
      { id: k6.id },
    ]);
  });

  it('only shows running divisions of the ground and competition', async () => {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const other = await createCompetition();
    for (const [contestId, ground] of [
      [contest.id, 2],
      [other.contest.id, 1],
    ] as const) {
      await createDivision(contestId, { ground, state: 'RUNNING' });
    }
    await createDivision(contest.id, { number: 2, state: 'ENDED' });
    expect((await getJudgingState(id, 1)).divisions).toEqual([]);
    expect((await getJudgingState(id, 2)).divisions).toHaveLength(1);
  });

  it('keeps women off the Barren next to men', async () => {
    const { id, contest } = await createCompetition();
    const women = await createDivision(contest.id, { state: 'RUNNING' });
    const men = await createDivision(contest.id, { sex: 'MALE', state: 'RUNNING' });
    await addStarter(id, women, 'sprung', { firstname: 'W' });
    await addStarter(id, men, 'sprung', { firstname: 'M' });
    const barren = await tablet(id, 'barren');
    expect(barren.divisionIds).toEqual([men.id]);
    expect(barren.rounds.map(names)).toEqual(['', 'M', '', '', '']);
    expect((await tablet(id, 'reck')).rounds.map(names)).toEqual(['', 'W', 'M', '', '']);
  });

  it('waits on the Barren while only women compete', async () => {
    const { id, contest } = await createCompetition();
    await createDivision(contest.id, { state: 'RUNNING' });
    expect(await tablet(id, 'barren')).toMatchObject({ status: 'WAITING', rounds: [] });
  });

  it('is finished when the other apparatus still compete', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    await setProgress(division.id, 4, 'reck');
    expect(await tablet(id, 'reck')).toMatchObject({ status: 'FINISHED', currentRound: null });
    expect(await tablet(id, 'boden')).toMatchObject({ status: 'JUDGING', currentRound: 0 });
  });

  it('marks entries withdrawn after the start and hides earlier ones', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    await addStarter(id, division, 'reck', { firstname: 'A', withdrawnAt: new Date() });
    await addStarter(id, division, 'reck', { firstname: 'B', withdrawnAt: new Date(0) });
    await addStarter(id, division, 'reck', { firstname: 'C' });
    const { rounds } = await tablet(id, 'reck');
    expect(rounds[0].slots).toMatchObject([
      { firstname: 'A', withdrawn: true },
      { firstname: 'C', withdrawn: false },
    ]);
  });

  describe('when a division starts while another one is mid-way', () => {
    async function setup() {
      const { id, contest } = await createCompetition();
      const early = await createDivision(contest.id, { state: 'RUNNING' });
      const late = await createDivision(contest.id, { number: 2, state: 'RUNNING' });
      const grades = { reck: 9000, boden: 9000, schaukelringe: 9000, sprung: 9000 };
      for (const apparatus of WOMEN) {
        await addStarter(id, early, apparatus, { firstname: `early-${apparatus}`, grades });
        await addStarter(id, late, apparatus, { firstname: `late-${apparatus}` });
      }
      await setProgress(early.id, 2);
      return { id, early, late };
    }

    it('judges the late one alone until it caught up, then both together', async () => {
      const { id, early, late } = await setup();
      const { rounds, ...state } = await tablet(id, 'reck');
      expect(state).toMatchObject({ currentRound: 0, divisionIds: [late.id] });
      expect(rounds.map(names)).toEqual([
        'late-reck',
        'late-sprung',
        'early-schaukelringe late-schaukelringe',
        'late-boden early-boden',
      ]);
      await setProgress(late.id, 2);
      expect(await tablet(id, 'reck')).toMatchObject({
        currentRound: 2,
        divisionIds: [early.id, late.id],
      });
    });

    it('can be judged to the end by confirming what the tablets show', async () => {
      const { id } = await setup();
      for (let step = 0; step < 4; step++) {
        for (const apparatus of WOMEN) {
          const { currentRound, divisionIds, rounds } = await tablet(id, apparatus);
          expect(currentRound).toBe(step);
          await saveGrades(
            id,
            rounds[step].slots.map(({ entryId }) => ({ entryId, apparatus, value: 9000 })),
            judge(apparatus),
          );
          await confirmRound(id, { ground: 1, apparatus, round: step, divisionIds });
        }
      }
      const divisions = await prisma.division.findMany();
      expect(divisions.map(({ state }) => state)).toEqual(['ENDED', 'ENDED']);
    });

    it('shows every division in the rounds that are done', async () => {
      const { id, early, late } = await setup();
      await setProgress(late.id, 2);
      const { rounds } = await tablet(id, 'reck');
      expect(names(rounds[0])).toBe('early-reck late-reck');
      expect(early.id).not.toBe(late.id);
    });
  });
});

describe('getDisplayState', () => {
  const MINUTE = 60_000;

  it('shows the running divisions in the round of the slowest apparatus', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    await addStarter(id, division, 'reck', { firstname: 'A' });
    await setProgress(division.id, 2);
    await setProgress(division.id, 1, 'boden');
    const state = await getDisplayState(id, 1);
    expect(state).toMatchObject({ divisionIds: [division.id], round: 1, hidesInMs: null });
    expect(state.apparatus.map(({ apparatus }) => apparatus)).toEqual(WOMEN);
    expect(names(state.apparatus[1].rounds[1])).toBe('A');
    expect(state.apparatus[0].rounds[0].slots[0].precision).toBe(2);
  });

  it('keeps the last round for five minutes', async () => {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const { endedAt, ...division } = await createDivision(contest.id, { state: 'ENDED' });
    const after = (ms: number) => getDisplayState(id, 1, new Date(Number(endedAt) + ms));
    expect(await after(4 * MINUTE)).toMatchObject({
      divisionIds: [division.id],
      round: 3,
      hidesInMs: MINUTE,
      apparatus: WOMEN.map((apparatus) => ({ apparatus, currentRound: null })),
    });
    expect(await after(5 * MINUTE)).toEqual({
      divisionIds: [],
      round: 0,
      hidesInMs: null,
      apparatus: [],
    });
    expect((await getDisplayState(id, 2)).divisionIds).toEqual([]);
  });

  it('only shows the running ones once the next division started', async () => {
    const { id, contest } = await createCompetition();
    await createDivision(contest.id, { state: 'ENDED' });
    const next = await createDivision(contest.id, { number: 2, state: 'RUNNING' });
    const { divisionIds, round } = await getDisplayState(id, 1);
    expect({ divisionIds, round }).toEqual({ divisionIds: [next.id], round: 0 });
  });
});

describe('getGradingState', () => {
  it('shows a division in any state', async () => {
    const { id, contest } = await createCompetition();
    for (const [index, state] of (['PENDING', 'RUNNING', 'ENDED'] as const).entries()) {
      const division = await createDivision(contest.id, { number: index + 1, state });
      await addStarter(id, division, 'reck', { firstname: state });
      const grading = await getGradingState(id, { divisionIds: [division.id] });
      expect(grading.apparatus.map(({ apparatus }) => apparatus)).toEqual(WOMEN);
      expect(grading.apparatus[0].rounds.map(names)).toEqual([state, '', '', '']);
    }
  });

  it('merges all running divisions of a ground whatever round they are in', async () => {
    const { id, contest } = await createCompetition();
    const early = await createDivision(contest.id, { state: 'RUNNING' });
    const late = await createDivision(contest.id, { number: 2, state: 'RUNNING' });
    await addStarter(id, early, 'reck', { firstname: 'early' });
    await addStarter(id, late, 'reck', { firstname: 'late' });
    await setProgress(early.id, 2);
    const { apparatus } = await getGradingState(id, { ground: 1 });
    expect(names(apparatus[0].rounds[0])).toBe('early late');
  });

  it('stays within the competition', async () => {
    const { contest } = await createCompetition();
    const division = await createDivision(contest.id);
    const other = await createCompetition();
    const grading = await getGradingState(other.id, { divisionIds: [division.id] });
    expect(grading.divisions).toEqual([]);
  });
});

describe('saveGrades', () => {
  async function setup(state: 'PENDING' | 'RUNNING' | 'ENDED' = 'RUNNING', category = 'K5') {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const division = await createDivision(contest.id, { state, category });
    const { entry } = await addStarter(id, division, 'reck');
    const save = (data: object, scope: GradeScope = EDITOR) =>
      saveGrades(id, [{ entryId: entry.id, apparatus: 'reck', value: 9000, ...data }], scope);
    const grade = (apparatus = 'reck') =>
      prisma.grade.findUnique({
        where: { entryId_apparatus: { entryId: entry.id, apparatus } },
      });
    return { id, division, entry, save, grade };
  }

  it('creates and overwrites one grade and tells the viewers', async () => {
    const { id, save, grade } = await setup();
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    await save({ value: 9100 });
    await save({ value: 0 });
    stop();
    expect(await grade()).toMatchObject({ value: 0, attempts: [] });
    expect(await prisma.grade.count()).toBe(1);
    expect(listener.mock.calls).toEqual([['grades'], ['grades']]);
  });

  it('survives being saved twice at once', async () => {
    const { save } = await setup();
    await Promise.all([1, 2, 3, 4].map((value) => save({ value })));
    expect(await prisma.grade.count()).toBe(1);
  });

  it.each([
    ['K5', [9100, 9210], 9210],
    ['K5', [0, 0], 0],
    ['K6', [9100, 9210], 9155],
    ['K7', [0, 9000], 4500],
  ])('computes the vault of %s from %j', async (category, attempts, value) => {
    const { save, grade } = await setup('RUNNING', category);
    await save({ apparatus: 'sprung', attempts, value: 1 });
    expect(await grade('sprung')).toMatchObject({ value, attempts });
  });

  it('accepts a final grade directly and forgets the attempts', async () => {
    const { save, grade } = await setup();
    await save({ apparatus: 'sprung', attempts: [9100, 9200] });
    await save({ apparatus: 'sprung', value: 9400 });
    expect(await grade('sprung')).toMatchObject({ value: 9400, attempts: [] });
  });

  it.each([
    { value: -1 },
    { value: 10001 },
    { value: 9.5 },
    { value: NaN },
    { value: undefined },
    { apparatus: 'sprung', attempts: [9000] },
    { apparatus: 'sprung', attempts: [9000, 9000, 9000] },
    { apparatus: 'sprung', attempts: [9000, 10001] },
    { attempts: [9000, 9000] },
  ])('rejects %j', async (data) => {
    const { save } = await setup();
    expect(await errorCode(save(data))).toBe('INVALID_GRADE');
    expect(await prisma.grade.count()).toBe(0);
  });

  it.each(['barren', 'nope'])('rejects women on %s', async (apparatus) => {
    const { save } = await setup();
    expect(await errorCode(save({ apparatus }))).toBe('INVALID_APPARATUS');
  });

  it('saves all or none', async () => {
    const { id, entry } = await setup();
    const save = saveGrades(
      id,
      [
        { entryId: entry.id, apparatus: 'reck', value: 9000 },
        { entryId: entry.id, apparatus: 'boden', value: 99999 },
      ],
      EDITOR,
    );
    expect(await errorCode(save)).toBe('INVALID_GRADE');
    expect(await prisma.grade.count()).toBe(0);
  });

  it('rejects withdrawn entries', async () => {
    const { entry, save } = await setup();
    await prisma.entry.update({ where: { id: entry.id }, data: { withdrawnAt: new Date() } });
    expect(await errorCode(save({}))).toBe('ENTRY_WITHDRAWN');
  });

  it('stays within the competition', async () => {
    const { save } = await setup();
    const other = await createCompetition();
    const foreign = await createStarter(other.id);
    expect(await errorCode(save({ entryId: foreign.entry.id }))).toBe('NOT_FOUND');
  });

  describe('with the grade the input was based on', () => {
    it('does not overwrite what someone else saved', async () => {
      const { save, grade } = await setup();
      await save({});
      expect(await errorCode(save({ value: 9500, version: null }))).toBe('GRADE_CHANGED');
      expect(await grade()).toMatchObject({ value: 9000, version: 1 });
      await save({ value: 9500, version: 1 });
      expect(await grade()).toMatchObject({ value: 9500, version: 2 });
    });

    it('notices a deleted grade', async () => {
      const { id, entry, save, grade } = await setup();
      await save({});
      await deleteGrade(id, { entryId: entry.id, apparatus: 'reck' }, EDITOR);
      expect(await errorCode(save({ value: 9500, version: 1 }))).toBe('GRADE_CHANGED');
      expect(await grade()).toBeNull();
    });

    it('can be repeated after a lost response', async () => {
      const { save, grade } = await setup();
      await save({ version: null });
      await save({ version: null });
      expect(await grade()).toMatchObject({ version: 1 });
    });

    it('refuses a request that arrives after a newer one', async () => {
      const { save, grade } = await setup();
      await save({});
      // The judge went back to the saved value, which counts as a change.
      await save({ value: 9000, version: 1 });
      expect(await errorCode(save({ value: 9500, version: 1 }))).toBe('GRADE_CHANGED');
      expect(await grade()).toMatchObject({ value: 9000, version: 2 });
    });

    it('does not delete a grade that was changed', async () => {
      const { id, entry, save, grade } = await setup();
      const key = { entryId: entry.id, apparatus: 'reck' };
      const [first] = await save({});
      const [second] = await save({ value: 9100 });
      const remove = (shown: typeof first) =>
        errorCode(deleteGrade(id, { ...key, version: shown.version }, EDITOR));
      expect(await remove(first)).toBe('GRADE_CHANGED');
      expect(await grade()).toMatchObject({ value: 9100 });
      expect(await remove(second)).toBeNull();
      expect(await remove(second)).toBeNull();
      expect(await grade()).toBeNull();
    });

    it('lets one of two devices win', async () => {
      const { save } = await setup();
      const codes = await Promise.all(
        [9100, 9200].map((value) => errorCode(save({ value, version: null }))),
      );
      expect(codes.toSorted()).toEqual(['GRADE_CHANGED', null]);
    });
  });

  describe('as a judge', () => {
    it('accepts an entry of a running division on the ground', async () => {
      const { save, grade } = await setup();
      await save({}, judge('reck'));
      expect(await grade()).toMatchObject({ value: 9000 });
    });

    it('rejects another apparatus', async () => {
      const { save } = await setup();
      expect(await errorCode(save({}, judge('boden')))).toBe('ENTRY_NOT_JUDGEABLE');
    });

    it('rejects another ground', async () => {
      const { save } = await setup();
      expect(await errorCode(save({}, judge('reck', 2)))).toBe('ENTRY_NOT_JUDGEABLE');
    });

    it.each(['PENDING', 'ENDED'] as const)('rejects a division that is %s', async (state) => {
      const { save } = await setup(state);
      expect(await errorCode(save({}, judge('reck')))).toBe('ENTRY_NOT_JUDGEABLE');
    });

    it('rejects an entry without a lineup', async () => {
      const { entry, save } = await setup();
      await prisma.entry.update({ where: { id: entry.id }, data: { startApparatus: null } });
      expect(await errorCode(save({}, judge('reck')))).toBe('ENTRY_NOT_JUDGEABLE');
    });

    it('rejects the Barren for women', async () => {
      const { save } = await setup();
      const barren = save({ apparatus: 'barren' }, judge('barren'));
      expect(await errorCode(barren)).toBe('INVALID_APPARATUS');
    });
  });

  it.each(['PENDING', 'RUNNING', 'ENDED'] as const)(
    'lets an editor grade a division that is %s',
    async (state) => {
      const { save, grade } = await setup(state);
      await save({});
      expect(await grade()).toMatchObject({ value: 9000 });
    },
  );

  describe('deleteGrade', () => {
    it('removes one grade in the same scope as saving', async () => {
      const { id, entry, save, grade } = await setup();
      const key = { entryId: entry.id, apparatus: 'reck' };
      await save({});
      await save({ apparatus: 'boden' });
      expect(await errorCode(deleteGrade(id, key, judge('reck', 2)))).toBe('ENTRY_NOT_JUDGEABLE');
      const other = await createCompetition();
      expect(await errorCode(deleteGrade(other.id, key, EDITOR))).toBe('NOT_FOUND');
      await deleteGrade(id, key, judge('reck'));
      expect(await grade()).toBeNull();
      expect(await grade('boden')).not.toBeNull();
    });
  });
});

describe('confirmRound', () => {
  async function setup() {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    const confirm = (data: object = {}) =>
      confirmRound(id, {
        ground: 1,
        apparatus: 'reck',
        round: 0,
        divisionIds: [division.id],
        ...data,
      });
    return { id, contest, division, confirm };
  }

  it('confirms a round, also an empty one, only for its apparatus', async () => {
    const { id, division, confirm } = await setup();
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    await confirm();
    stop();
    expect(await progressOf(division.id)).toEqual({
      reck: 1,
      boden: 0,
      schaukelringe: 0,
      sprung: 0,
    });
    expect(listener).toHaveBeenCalledWith('divisions');
  });

  it('can be repeated', async () => {
    const { division, confirm } = await setup();
    await confirm();
    await confirm();
    expect(await progressOf(division.id)).toMatchObject({ reck: 1 });
  });

  it('counts a double tap once', async () => {
    const { division, confirm } = await setup();
    await Promise.all([confirm(), confirm(), confirm()]);
    expect(await progressOf(division.id)).toMatchObject({ reck: 1 });
  });

  it('cannot skip a round', async () => {
    const { confirm } = await setup();
    expect(await errorCode(confirm({ round: 1 }))).toBe('ROUND_NOT_CURRENT');
    expect(await errorCode(confirm({ round: -1 }))).toBe('ROUND_NOT_CURRENT');
  });

  it('needs the grades of everyone on the apparatus in that round', async () => {
    const { id, division, confirm } = await setup();
    const a = await addStarter(id, division, 'reck');
    await addStarter(id, division, 'boden');
    expect(await errorCode(confirm())).toBe('GRADES_MISSING');
    const grade = (apparatus: string) =>
      saveGrades(id, [{ entryId: a.entry.id, apparatus, value: 0 }], judge(apparatus));
    await grade('boden');
    expect(await errorCode(confirm())).toBe('GRADES_MISSING');
    await grade('reck');
    await confirm();
    // Next round: the lineup that started on Sprung is empty.
    await confirm({ round: 1 });
  });

  it('needs no grade of withdrawn entries', async () => {
    const { id, division, confirm } = await setup();
    await addStarter(id, division, 'reck', { withdrawnAt: new Date() });
    await confirm();
  });

  it('confirms all divisions or none', async () => {
    const { id, contest, division, confirm } = await setup();
    const second = await createDivision(contest.id, { number: 2, state: 'RUNNING' });
    await addStarter(id, second, 'reck');
    const both = { divisionIds: [division.id, second.id] };
    expect(await errorCode(confirm(both))).toBe('GRADES_MISSING');
    expect(await progressOf(division.id)).toMatchObject({ reck: 0 });
  });

  it('ends the division with the last apparatus', async () => {
    const { division, confirm } = await setup();
    await setProgress(division.id, 4);
    await setProgress(division.id, 3, 'reck');
    await confirm({ round: 3 });
    expect(await prisma.division.findUnique({ where: { id: division.id } })).toMatchObject({
      state: 'ENDED',
      endedAt: expect.any(Date),
    });
    // The tablet may send it again after a lost response.
    await confirm({ round: 3 });
    expect(await errorCode(confirm({ round: 4 }))).toBe('DIVISION_NOT_RUNNING');
  });

  it('loses nothing when apparatus confirm at the same time', async () => {
    const { division, confirm } = await setup();
    for (let round = 0; round < 4; round++) {
      await Promise.all(WOMEN.map((apparatus) => confirm({ apparatus, round })));
    }
    expect(await progressOf(division.id)).toEqual({
      reck: 4,
      boden: 4,
      schaukelringe: 4,
      sprung: 4,
    });
    expect(await prisma.division.findFirst()).toMatchObject({ state: 'ENDED' });
  });

  it('does not deadlock on divisions given in different order', async () => {
    const { contest, division, confirm } = await setup();
    const second = await createDivision(contest.id, { number: 2, state: 'RUNNING' });
    const ids = [division.id, second.id];
    for (let round = 0; round < 4; round++) {
      await Promise.all(
        WOMEN.map((apparatus, index) =>
          confirm({ apparatus, round, divisionIds: index % 2 ? ids : ids.toReversed() }),
        ),
      );
    }
    expect(await prisma.division.count({ where: { state: 'ENDED' } })).toBe(2);
  });

  it('only confirms running divisions of the ground that use the apparatus', async () => {
    const { id, contest, division, confirm } = await setup();
    expect(await errorCode(confirm({ divisionIds: [] }))).toBe('NOT_FOUND');
    expect(await errorCode(confirm({ ground: 2 }))).toBe('NOT_FOUND');
    expect(await errorCode(confirm({ apparatus: 'barren' }))).toBe('INVALID_APPARATUS');
    const pending = await createDivision(contest.id, { number: 2 });
    expect(await errorCode(confirm({ divisionIds: [pending.id] }))).toBe('DIVISION_NOT_RUNNING');
    const other = await createCompetition();
    const foreign = confirmRound(other.id, {
      ground: 1,
      apparatus: 'reck',
      round: 0,
      divisionIds: [division.id],
    });
    expect(await errorCode(foreign)).toBe('NOT_FOUND');
    expect(id).not.toBe(other.id);
  });

  it.each([4, 7, 0.5])('rejects round %s, which the division does not have', async (round) => {
    const { division, confirm } = await setup();
    await setProgress(division.id, Math.floor(round), 'reck');
    expect(await errorCode(confirm({ round }))).toBe('ROUND_NOT_CURRENT');
    expect(await progressOf(division.id)).toMatchObject({ reck: Math.floor(round) });
  });
});

describe('ending a division', () => {
  async function setup() {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    const { entry } = await addStarter(id, division, 'reck', {
      firstname: 'Anna',
      lastname: 'Muster',
      grades: { reck: 9000, boden: 9000, schaukelringe: 9000, sprung: 9000 },
    });
    const confirm = (apparatus: string, round: number) =>
      confirmRound(id, { ground: 1, apparatus, round, divisionIds: [division.id] });
    const confirmAll = async (round: number, apparatus = WOMEN) => {
      for (const key of apparatus) await confirm(key, round);
    };
    const state = async () => (await prisma.division.findFirstOrThrow()).state;
    return { id, division, entry, confirm, confirmAll, state };
  }

  async function failure(action: Promise<unknown>) {
    return action.then(
      () => null,
      (error: unknown) => error as DomainError,
    );
  }

  it('needs every grade and tells which are missing', async () => {
    const { id, division, entry, confirm, confirmAll, state } = await setup();
    await confirmAll(0);
    await deleteGrade(id, { entryId: entry.id, apparatus: 'reck' }, EDITOR);
    // Neither withdrawn entries nor those without a lineup count.
    await addStarter(id, division, 'reck', { withdrawnAt: new Date() });
    await addStarter(id, division, 'reck', { startApparatus: undefined });
    for (const round of [1, 2]) await confirmAll(round);
    await confirmAll(3, WOMEN.slice(0, 3));

    const error = await failure(confirm('sprung', 3));
    expect(error).toMatchObject({
      code: 'GRADES_MISSING',
      details: {
        missing: [{ entryId: entry.id, firstname: 'Anna', lastname: 'Muster', apparatus: 'reck' }],
      },
    });
    expect(domainErrorMessage(error, createI18n('de').getFixedT(null, NAMESPACES))).toBe(
      'Es fehlen noch Noten. Anna Muster (Reck)',
    );
    expect(await state()).toBe('RUNNING');
    expect(await progressOf(division.id)).toMatchObject({ sprung: 3 });

    // An editor enters the grade of the past round and confirms.
    await saveGrades(id, [{ entryId: entry.id, apparatus: 'reck', value: 8000 }], EDITOR);
    await confirm('sprung', 3);
    expect(await state()).toBe('ENDED');
  });

  it('catches an entry that skipped an apparatus by moving to another lineup', async () => {
    const { id, division, entry, confirm, confirmAll, state } = await setup();
    await deleteGrade(id, { entryId: entry.id, apparatus: 'boden' }, EDITOR);
    await confirmAll(0);
    const lineup = { divisionId: division.id, apparatus: 'boden' };
    await moveEntriesToLineup(id, lineup, [entry.id]);
    for (const round of [1, 2]) await confirmAll(round);
    await confirmAll(3, WOMEN.slice(0, 3));
    expect(await errorCode(confirm('sprung', 3))).toBe('GRADES_MISSING');
    expect(await state()).toBe('RUNNING');
  });

  it('names the missing grades of a normal round as well', async () => {
    const { id, division, confirm } = await setup();
    const { entry } = await addStarter(id, division, 'reck');
    expect(await failure(confirm('reck', 0))).toMatchObject({
      details: { missing: [{ entryId: entry.id, apparatus: 'reck' }] },
    });
  });

  it('does not let a judge delete a grade of a confirmed round', async () => {
    const { id, entry, confirm } = await setup();
    const remove = (apparatus: string, scope: GradeScope) =>
      errorCode(deleteGrade(id, { entryId: entry.id, apparatus }, scope));
    await confirm('reck', 0);
    expect(await remove('reck', judge('reck'))).toBe('ROUND_NOT_CURRENT');
    expect(await remove('boden', judge('boden'))).toBeNull();
    expect(await remove('reck', EDITOR)).toBeNull();
    expect(await prisma.grade.count()).toBe(2);
  });

  it.each(['saveGrades', 'deleteGrade'])('%s waits for a confirmation', async (service) => {
    const { id, division, entry } = await setup();
    const key = { entryId: entry.id, apparatus: 'reck' };
    let change!: Promise<unknown>;
    let isDone = false;
    await prisma.$transaction(async (tx) => {
      await lockDivisions(tx, id, [division.id]);
      change =
        service === 'saveGrades'
          ? saveGrades(id, [{ ...key, value: 1 }], judge('reck'))
          : deleteGrade(id, key, judge('reck'));
      change = change.then(
        () => (isDone = true),
        (error: DomainError) => error.code,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(isDone).toBe(false);
      await tx.division.update({ where: { id: division.id }, data: { state: 'ENDED' } });
    });
    expect(await change).toBe('ENTRY_NOT_JUDGEABLE');
  });

  it('lets several apparatus save at once', async () => {
    const { id, division, entry } = await setup();
    await prisma.$transaction(async (tx) => {
      await lockDivisions(tx, id, [division.id], 'SHARE');
      await saveGrades(id, [{ entryId: entry.id, apparatus: 'reck', value: 1 }], judge('reck'));
    });
  });

  it('saves the same grades from two devices without a deadlock', async () => {
    const { id, division } = await setup();
    const inputs = [];
    for (let index = 0; index < 20; index++) {
      const { entry } = await addStarter(id, division, 'reck', { grades: { reck: 1 } });
      inputs.push({ entryId: entry.id, apparatus: 'reck', value: 9000 + index });
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      const [saved] = await Promise.all([
        saveGrades(id, inputs.toReversed(), EDITOR),
        saveGrades(id, inputs, EDITOR),
      ]);
      expect(saved.map(({ entryId }) => entryId)).toEqual(
        inputs.toReversed().map(({ entryId }) => entryId),
      );
    }
  }, 30_000);
});

describe('attempts', () => {
  // Two decimals keep the average of two attempts exact, so it is only rounded in the ranking.
  it('have at most two decimals', async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { category: 'K6', state: 'RUNNING' });
    const { entry } = await addStarter(id, division, 'sprung');
    const save = (apparatus: string, data: object) =>
      saveGrades(id, [{ entryId: entry.id, apparatus, ...data }], EDITOR);
    expect(await errorCode(save('sprung', { attempts: [9005, 9004] }))).toBe('INVALID_GRADE');
    expect(await save('sprung', { attempts: [9000, 9010] })).toMatchObject([{ value: 9005 }]);
    // A final grade may have three.
    expect(await save('sprung', { value: 9225 })).toMatchObject([{ value: 9225 }]);
    expect(await save('reck', { attempts: [9225] })).toMatchObject([{ value: 9225 }]);
  });
});
