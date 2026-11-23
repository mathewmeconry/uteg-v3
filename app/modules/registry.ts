import { egtModule } from './egt/module';
import type { ContestModule } from './types';

const modules: Record<string, ContestModule> = {
  // Config is only ever read through configSchema, see getContestModule.
  [egtModule.key]: egtModule as unknown as ContestModule,
};

/** A contest's module bound to its validated config. */
export type BoundModule = ReturnType<typeof bindModule>;

function bindModule<Config>(module: ContestModule<Config>, rawConfig: unknown) {
  const config = module.configSchema.parse(rawConfig);
  return {
    key: module.key,
    config,
    apparatus: (sex: Parameters<typeof module.apparatus>[1]) => module.apparatus(config, sex),
    categories: (sex: Parameters<typeof module.categories>[1]) => module.categories(config, sex),
    inputRule: (apparatus: string, category: string) =>
      module.inputRule(config, apparatus, category),
    rankingOptions: (category: string, sex: Parameters<typeof module.rankingOptions>[2]) =>
      module.rankingOptions(config, category, sex),
  };
}

export function getModule(key: string): ContestModule {
  const module = modules[key];
  if (!module) throw new Error(`Unknown contest module "${key}"`);
  return module;
}

type StoredContest = { module: string; config: unknown };

/** The module of a contest with its stored config. */
export function getContestModule(contest: StoredContest) {
  return bindModule(getModule(contest.module), contest.config);
}

/** Every apparatus of the contests, in rotation order. */
export function getContestsApparatus(contests: readonly StoredContest[]) {
  const keys = contests.flatMap((contest) => {
    const module = getContestModule(contest);
    return [...module.apparatus('MALE'), ...module.apparatus('FEMALE')];
  });
  return [...new Set(keys)];
}
