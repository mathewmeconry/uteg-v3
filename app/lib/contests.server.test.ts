import { z } from 'zod';
import { egtModule, type EgtConfig } from '~/modules/egt/module';
import { registerModule } from '~/modules/registry';
import type { ContestModule } from '~/modules/types';
import {
  createCompetition,
  createDivision,
  createStarter,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import {
  countAttemptGrades,
  createContestFromRanking,
  getConfigVersion,
  getContest,
  patchContestConfig,
  updateContestConfig,
} from './contests.server';
import { createDivision as createDivisionService, startDivisions } from './divisions.server';
import { subscribe } from './events.server';
import { confirmRound, getJudgingState, saveGrades } from './judging.server';
import { moveEntriesToLineup } from './lineups.server';
import { lockContest, lockContestConfigs } from './locks.server';
import { prisma } from './prisma.server';
import { getRanking } from './ranking.server';

beforeEach(truncateTables);

describe('getContest and updateContestConfig', () => {
  it('saves a valid config', async () => {
    const { id, contest } = await createCompetition();
    await updateContestConfig(id, contest.id, { ...egtModule.defaultConfig, precision: 3 });
    const loaded = await getContest(id, contest.id);
    expect(loaded.module.rankingOptions('K5', 'FEMALE').precision).toBe(3);
  });

  it('rejects an invalid config', async () => {
    const { id, contest } = await createCompetition();
    const config = { ...egtModule.defaultConfig, precision: 7 };
    expect(await errorCode(updateContestConfig(id, contest.id, config))).toBe('INVALID_CONFIG');
  });

  it('stays within the competition', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const { contest } = other;
    expect(await errorCode(getContest(id, contest.id))).toBe('NOT_FOUND');
    const update = updateContestConfig(id, contest.id, egtModule.defaultConfig);
    expect(await errorCode(update)).toBe('NOT_FOUND');
  });

  it('rejects several attempts that are not combined', async () => {
    const { id, contest } = await createCompetition();
    const config = withVault({ K5: { attempts: 2, aggregation: 'NONE' } });
    expect(await errorCode(updateContestConfig(id, contest.id, config))).toBe('INVALID_CONFIG');
  });
});

describe('changed vault rules', () => {
  async function setup(category = 'K5') {
    const competition = await createCompetition();
    const { entry } = await createStarter(competition.id, { category });
    return { ...competition, entry };
  }

  function addVault(entryId: string, value: number, attempts: number[]) {
    return prisma.grade.create({ data: { entryId, apparatus: 'sprung', value, attempts } });
  }

  async function vaultOf(entryId: string) {
    return prisma.grade.findFirstOrThrow({
      where: { entryId, apparatus: 'sprung' },
      select: { value: true, attempts: true },
    });
  }

  const AVERAGE = withVault({ K5: { attempts: 2, aggregation: 'AVG' } });

  it('recompute the stored grades of the category', async () => {
    const { id, contest, entry } = await setup();
    const { id: gradeId, updatedAt } = await addVault(entry.id, 9000, [8000, 9000]);
    expect(await updateContestConfig(id, contest.id, AVERAGE)).toEqual({ recomputed: 1 });
    expect(await vaultOf(entry.id)).toEqual({ value: 8500, attempts: [8000, 9000] });
    // It must not look like the latest grade, but judges have not seen it yet.
    expect(await prisma.grade.findUnique({ where: { id: gradeId } })).toMatchObject({
      updatedAt,
      version: 2,
    });
  });

  it('use the category of the division when the entry has none', async () => {
    const { id, contest, entry } = await setup();
    const division = await createDivision(contest.id, { category: 'K5' });
    await prisma.entry.update({
      where: { id: entry.id },
      data: { category: null, divisionId: division.id },
    });
    await addVault(entry.id, 9000, [8000, 9000]);
    expect(await updateContestConfig(id, contest.id, AVERAGE)).toEqual({ recomputed: 1 });
  });

  it('leave other categories, directly entered grades and other numbers of attempts', async () => {
    const { id, contest, entry } = await setup();
    const { entry: k4 } = await createStarter(id, { category: 'K4' });
    const { entry: direct } = await createStarter(id, { grades: { sprung: 9100 } });
    await addVault(k4.id, 9000, [8000, 9000]);
    await addVault(entry.id, 9000, [8000, 8500, 9000]);
    expect(await updateContestConfig(id, contest.id, AVERAGE)).toEqual({ recomputed: 0 });
    expect((await vaultOf(k4.id)).value).toBe(9000);
    expect((await vaultOf(entry.id)).value).toBe(9000);
    expect((await vaultOf(direct.id)).value).toBe(9100);
  });

  it('recompute grades that were kept when the number of attempts comes back', async () => {
    const { id, contest, entry } = await setup();
    await addVault(entry.id, 9000, [8000, 9000]);
    const three = withVault({ K5: { attempts: 3, aggregation: 'AVG' } });
    expect(await updateContestConfig(id, contest.id, three)).toEqual({ recomputed: 0 });
    expect(await updateContestConfig(id, contest.id, AVERAGE)).toEqual({ recomputed: 1 });
    expect((await vaultOf(entry.id)).value).toBe(8500);
  });

  it('leave grades of other contests', async () => {
    const { id, contest } = await setup();
    const other = await setup();
    await addVault(other.entry.id, 9000, [8000, 9000]);
    expect(await updateContestConfig(id, contest.id, AVERAGE)).toEqual({ recomputed: 0 });
    expect((await vaultOf(other.entry.id)).value).toBe(9000);
  });

  it('are announced to the viewers of grades', async () => {
    const { id, contest, entry } = await setup();
    await addVault(entry.id, 9000, [8000, 9000]);
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    await updateContestConfig(id, contest.id, AVERAGE);
    stop();
    expect(listener.mock.calls.flat()).toEqual(['settings', 'grades']);
  });

  const LONG = { timeout: 30_000 };

  /** Until the work is done or waits for a lock of another transaction, however long it takes. */
  async function doneOrBlocked(work: Promise<unknown>) {
    let done = false;
    void work.finally(() => (done = true)).catch(() => {});
    while (!done) {
      const [{ blocked }] = await prisma.$queryRaw<{ blocked: bigint }[]>`
        SELECT count(*) AS blocked FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (blocked > 0) return;
    }
  }

  it('apply to a grade saved at the same time', LONG, async () => {
    const { id, contest, entry } = await setup();
    await addVault(entry.id, 9000, [8000, 9000]);
    let save: Promise<unknown> | undefined;
    // Holds what updateContestConfig holds while it recomputes.
    await prisma.$transaction(async (tx) => {
      await lockContest(tx, contest.id);
      await tx.contest.update({ where: { id: contest.id }, data: { config: AVERAGE } });
      save = saveGrades(id, [{ entryId: entry.id, apparatus: 'sprung', attempts: [9500, 9700] }], {
        kind: 'editor',
      });
      await doneOrBlocked(save);
    }, LONG);
    await save;
    expect(await vaultOf(entry.id)).toEqual({ value: 9600, attempts: [9500, 9700] });
  });

  it('do not deadlock with saved grades and confirmed rounds', LONG, async () => {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    const entryIds: string[] = [];
    for (let index = 0; index < 8; index++) {
      const { entry } = await createStarter(id, {
        divisionId: division.id,
        lineupId: division.lineup('sprung'),
      });
      entryIds.push(entry.id);
      await addVault(entry.id, 9000, [8000, 9000]);
    }
    const save = (ids: string[]) =>
      saveGrades(
        id,
        ids.map((entryId) => ({ entryId, apparatus: 'sprung', attempts: [8000, 9000] })),
        { kind: 'judge', ground: 1, apparatus: 'sprung' },
      );
    const confirm = (apparatus: string) =>
      confirmRound(id, { ground: 1, apparatus, round: 0, divisionIds: [division.id] });

    for (let step = 0; step < 6; step++) {
      const [last, other] = step % 2 ? [AVERAGE, egtModule.defaultConfig] : [];
      await Promise.all([
        updateContestConfig(id, contest.id, last ?? egtModule.defaultConfig),
        save(entryIds),
        confirm('sprung'),
        confirm('reck'),
        updateContestConfig(id, contest.id, other ?? AVERAGE),
        save(entryIds.toReversed()),
        confirm('sprung'),
      ]);
      // Whichever config came last, every grade follows it.
      const { module } = await getContest(id, contest.id);
      const isAverage = module.inputRule('sprung', 'K5').aggregation === 'AVG';
      const grades = await prisma.grade.findMany({ where: { entryId: { in: entryIds } } });
      expect(new Set(grades.map(({ value }) => value))).toEqual(new Set([isAverage ? 8500 : 9000]));
    }
  });

  it('wait for a grade that is being saved', LONG, async () => {
    const { id, contest, entry } = await setup();
    await addVault(entry.id, 9000, [8000, 9000]);
    let update: Promise<unknown> | undefined;
    await prisma.$transaction(async (tx) => {
      await lockContestConfigs(tx, id);
      update = updateContestConfig(id, contest.id, AVERAGE);
      await doneOrBlocked(update);
      await tx.grade.updateMany({
        where: { entryId: entry.id },
        data: { value: 9700, attempts: [9500, 9700] },
      });
    }, LONG);
    await update;
    expect(await vaultOf(entry.id)).toEqual({ value: 9600, attempts: [9500, 9700] });
  });

  it('lists how many grades have attempts', async () => {
    const { id, contest, entry } = await setup();
    const { entry: second } = await createStarter(id);
    await createStarter(id, { grades: { sprung: 9000 } });
    await addVault(entry.id, 9000, [8000, 9000]);
    await addVault(second.id, 9000, [7000, 9000]);
    expect(await countAttemptGrades(id, contest.id)).toEqual([
      { apparatus: 'sprung', category: 'K5', attempts: 2, count: 2 },
    ]);
    const other = await createCompetition();
    expect(await errorCode(countAttemptGrades(other.id, contest.id))).toBe('NOT_FOUND');
  });
});

describe('changing the config at the same time', () => {
  const PRECISE = { ...egtModule.defaultConfig, precision: 3 as const };

  it('is refused when the version is outdated', async () => {
    const { id, contest } = await createCompetition();
    const version = getConfigVersion(await getContest(id, contest.id));
    await updateContestConfig(id, contest.id, PRECISE, { version });
    const late = updateContestConfig(id, contest.id, egtModule.defaultConfig, { version });
    expect(await errorCode(late)).toBe('CONFIG_CHANGED');
    expect((await getContest(id, contest.id)).module.config).toMatchObject({ precision: 3 });
    const newVersion = getConfigVersion(await getContest(id, contest.id));
    await updateContestConfig(id, contest.id, egtModule.defaultConfig, { version: newVersion });
  });

  it('lets only one of two saves win', async () => {
    const { id, contest } = await createCompetition();
    const version = getConfigVersion(await getContest(id, contest.id));
    const results = await Promise.all(
      [2, 3].map((precision) =>
        errorCode(
          updateContestConfig(
            id,
            contest.id,
            { ...egtModule.defaultConfig, honourRounding: 'ceil', precision },
            { version },
          ),
        ),
      ),
    );
    expect(results.toSorted()).toEqual(['CONFIG_CHANGED', null]);
  });

  it('keeps all patches', async () => {
    const { id, contest } = await createCompetition();
    const categories = ['K1', 'K2', 'K3', 'K4', 'K5'];
    await Promise.all(
      categories.map((category) =>
        patchContestConfig<EgtConfig>(id, contest.id, (config) => ({
          ...config,
          honourPercent: {
            ...config.honourPercent,
            MALE: { ...config.honourPercent.MALE, [category]: 50 },
          },
        })),
      ),
    );
    const { module } = await getContest(id, contest.id);
    for (const category of categories) {
      expect(module.rankingOptions(category, 'MALE').honourPercent).toBe(50);
    }
  });

  it('refuses an invalid patch', async () => {
    const { id, contest } = await createCompetition();
    const patch = patchContestConfig<any>(id, contest.id, (config) => ({
      ...config,
      precision: 7,
    }));
    expect(await errorCode(patch)).toBe('INVALID_CONFIG');
    const empty = patchContestConfig<any>(id, contest.id, () => undefined);
    expect(await errorCode(empty)).toBe('INVALID_CONFIG');
  });
});

function withVault(categories: Record<string, { attempts: number; aggregation: string }>) {
  const { inputs } = egtModule.defaultConfig;
  return { ...egtModule.defaultConfig, inputs: { sprung: { ...inputs.sprung, categories } } };
}

describe('createContestFromRanking', () => {
  // A final on two apparatus, different from EGT in everything a module decides.
  const finalModule: ContestModule<object> = {
    key: 'test-final',
    configSchema: z.object({}),
    defaultConfig: {},
    apparatus: () => ['reck', 'boden'],
    categories: () => ['Final'],
    inputRule: () => ({ attempts: 1, aggregation: 'NONE' }),
    rankingOptions: () => ({
      tieBreak: [],
      precision: 3,
      honourPercent: 0,
      honourRounding: 'round',
    }),
  };
  let unregister: () => void;

  beforeEach(() => {
    unregister = registerModule(finalModule);
  });
  afterEach(() => unregister());

  async function createRanked() {
    const competition = await createCompetition();
    const division = await createDivision(competition.contest.id, { state: 'ENDED' });
    const add = (firstname: string, reck: number) =>
      createStarter(competition.id, {
        firstname,
        divisionId: division.id,
        lineupId: division.lineup('reck'),
        grades: { reck },
      });
    const starters = [
      await add('Third', 8000),
      await add('First', 9500),
      await add('Second', 9000),
      await add('SecondToo', 9000),
      await add('Last', 7000),
    ];
    return { competition, division, starters };
  }

  it('runs a second contest with its own entries and grades', async () => {
    const { competition } = await createRanked();
    const final = await createContestFromRanking(competition.id, competition.contest.id, {
      module: 'test-final',
      name: 'Final',
      groups: [{ sex: 'FEMALE', sourceCategories: ['K5'], topN: 2, targetCategory: 'Final' }],
    });

    const entries = await prisma.entry.findMany({
      where: { contestId: final.id },
      include: { starter: true },
      orderBy: { position: 'asc' },
    });
    expect(entries.map(({ starter, category }) => [starter.firstname, category])).toEqual([
      ['First', 'Final'],
      ['Second', 'Final'],
      ['SecondToo', 'Final'],
    ]);
    expect(final).toMatchObject({ sourceContestId: competition.contest.id, position: 1 });

    // Compete in the final.
    const division = await createDivisionService(competition.id, final.id, {
      category: 'Final',
      sex: 'FEMALE',
      ground: 1,
    });
    const lineup = division.lineups.find(({ apparatus }) => apparatus === 'reck')!;
    await prisma.entry.updateMany({
      where: { contestId: final.id },
      data: { divisionId: division.id },
    });
    const ids = entries.map((entry) => entry.id);
    await moveEntriesToLineup(competition.id, lineup.id, ids);
    await startDivisions(competition.id, [division.id]);
    for (const round of [0, 1]) {
      for (const apparatus of ['reck', 'boden']) {
        const state = await getJudgingState(competition.id, 1, apparatus);
        const { slots } = state.apparatus[0].rounds[round];
        await saveGrades(
          competition.id,
          slots.map(({ entryId }) => ({
            entryId,
            apparatus,
            value: 9000 + ids.indexOf(entryId),
          })),
          { kind: 'judge', ground: 1, apparatus },
        );
        await confirmRound(competition.id, {
          ground: 1,
          apparatus,
          round,
          divisionIds: [division.id],
        });
      }
    }

    const ranking = await getRanking(competition.id, final.id, {
      category: 'Final',
      sex: 'FEMALE',
    });
    expect(ranking.entries.map(({ firstname, total }) => [firstname, total])).toEqual([
      ['SecondToo', 18004],
      ['Second', 18002],
      ['First', 18000],
    ]);
    // The first contest is unchanged.
    const source = await getRanking(competition.id, competition.contest.id, {
      category: 'K5',
      sex: 'FEMALE',
    });
    expect(source.entries.map(({ total }) => total)).toEqual([9500, 9000, 9000, 8000, 7000]);
  });

  const group = { sex: 'FEMALE', sourceCategories: ['K5'], topN: 2 } as const;

  it('rejects a running source, unknown categories and modules', async () => {
    const { competition, division } = await createRanked();
    const create = (data: { module?: string; targetCategory?: string } = {}) =>
      errorCode(
        createContestFromRanking(competition.id, competition.contest.id, {
          module: data.module ?? 'test-final',
          name: 'Final',
          groups: [{ ...group, targetCategory: data.targetCategory ?? 'Final' }],
        }),
      );
    expect(await create({ targetCategory: 'K5' })).toBe('INVALID_CATEGORY');
    expect(await create({ module: 'nope' })).toBe('INVALID_CONFIG');
    await prisma.division.update({ where: { id: division.id }, data: { state: 'RUNNING' } });
    expect(await create()).toBe('DIVISION_NOT_ENDED');
    expect(await prisma.contest.count()).toBe(1);
  });

  it('rejects a source with a division that has not started', async () => {
    const { competition } = await createRanked();
    const pending = await createDivision(competition.contest.id, { number: 2 });
    const create = () =>
      errorCode(
        createContestFromRanking(competition.id, competition.contest.id, {
          module: 'test-final',
          name: 'Final',
          groups: [{ ...group, targetCategory: 'Final' }],
        }),
      );
    expect(await create()).toBe('DIVISION_NOT_ENDED');
    expect(await prisma.contest.count()).toBe(1);
    // Other categories may still compete.
    await prisma.division.update({ where: { id: pending.id }, data: { category: 'K6' } });
    expect(await create()).toBeNull();
  });

  it('enters nobody twice', async () => {
    const { competition } = await createRanked();
    const groups = [group, group].map((item) => ({ ...item, targetCategory: 'Final' }));
    const final = await createContestFromRanking(competition.id, competition.contest.id, {
      module: 'test-final',
      name: 'Final',
      groups,
    });
    expect(await prisma.entry.count({ where: { contestId: final.id } })).toBe(3);
  });
});
