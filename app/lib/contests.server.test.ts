import { egtModule, type EgtConfig } from '~/modules/egt/module';
import { createCompetition, createStarter, errorCode, truncateTables } from '~/tests/helpers';
import {
  getConfigVersion,
  getContest,
  patchContestConfig,
  updateContestConfig,
} from './contests.server';
import { saveGrades } from './judging.server';

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

describe('a vault rule', () => {
  const AVERAGE = withVault({ K5: { attempts: 2, aggregation: 'AVG' } });

  async function setup(grade: { attempts: number[] } | { value: number }) {
    const { id, contest } = await createCompetition();
    const { entry } = await createStarter(id, { category: 'K5' });
    const input = { entryId: entry.id, apparatus: 'sprung', ...grade };
    await saveGrades(id, [input], { kind: 'editor' });
    return (config: unknown) => errorCode(updateContestConfig(id, contest.id, config));
  }

  it('cannot change once grades were computed with it', async () => {
    const update = await setup({ attempts: [8000, 9000] });
    expect(await update(AVERAGE)).toBe('RULE_IN_USE');
    // Anything else can.
    const precise = { ...egtModule.defaultConfig, precision: 3 };
    expect(await update(precise)).toBeNull();
    const otherCategory = withVault({ K4: { attempts: 2, aggregation: 'AVG' } });
    expect(
      await update({ ...precise, inputs: mergeVault(egtModule.defaultConfig, otherCategory) }),
    ).toBeNull();
  });

  it('can change when the final grades were entered directly', async () => {
    const update = await setup({ value: 9000 });
    expect(await update(AVERAGE)).toBeNull();
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

type Categories = Record<string, { attempts: number; aggregation: string }>;

function withVault(categories: Categories) {
  const { inputs } = egtModule.defaultConfig;
  return { ...egtModule.defaultConfig, inputs: { sprung: { ...inputs.sprung, categories } } };
}

function mergeVault(a: EgtConfig, b: ReturnType<typeof withVault>) {
  const sprung = a.inputs.sprung!;
  const categories = { ...sprung.categories, ...b.inputs.sprung.categories };
  return { sprung: { ...sprung, categories } };
}
