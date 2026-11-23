import type { AttemptGradeCount } from '~/lib/contests.server';
import { egtModule, type EgtConfig } from '~/modules/egt/module';
import type { InputRule, Sex } from '~/modules/types';

export const SEXES: Sex[] = ['FEMALE', 'MALE'];

export function getCategories(sex: Sex) {
  return egtModule.categories(egtModule.defaultConfig, sex);
}

/** The categories of both sexes, which share the vault rules. */
export const VAULT_CATEGORIES = [...new Set(SEXES.flatMap(getCategories))];

export function setAllHonour(percent: number): EgtConfig['honourPercent'] {
  const all = (sex: Sex) =>
    Object.fromEntries(getCategories(sex).map((category) => [category, percent]));
  return { FEMALE: all('FEMALE'), MALE: all('MALE') };
}

export function getVaultRule(config: EgtConfig, category: string) {
  return egtModule.inputRule(config, 'sprung', category);
}

/** Categories are only stored when they differ from the default. */
export function setVaultRule(config: EgtConfig, category: string, rule: InputRule): EgtConfig {
  const vault = config.inputs.sprung ?? {
    default: { attempts: 1, aggregation: 'NONE' },
    categories: {},
  };
  const categories = { ...vault.categories, [category]: normalize(rule) };
  if (isSameRule(categories[category], vault.default)) delete categories[category];
  return { ...config, inputs: { ...config.inputs, sprung: { ...vault, categories } } };
}

/** What saving does to stored grades, see updateContestConfig. */
export function getAffectedGrades(
  oldConfig: EgtConfig,
  newConfig: EgtConfig,
  counts: readonly AttemptGradeCount[],
) {
  let recompute = 0;
  let keep = 0;
  for (const { apparatus, category, attempts, count } of counts) {
    const rule = egtModule.inputRule(newConfig, apparatus, category);
    if (isSameRule(rule, egtModule.inputRule(oldConfig, apparatus, category))) continue;
    if (rule.attempts === attempts) recompute += count;
    else keep += count;
  }
  return { recompute, keep };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** One attempt is the grade, several have to be combined. */
function normalize({ attempts, aggregation }: InputRule): InputRule {
  if (attempts === 1) return { attempts, aggregation: 'NONE' };
  return { attempts, aggregation: aggregation === 'NONE' ? 'MAX' : aggregation };
}

function isSameRule(a: InputRule, b: InputRule) {
  return a.attempts === b.attempts && a.aggregation === b.aggregation;
}
