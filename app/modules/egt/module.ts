import { z } from 'zod';
import type { ContestModule, Sex } from '../types';

/** Rotation order. The men's Barren comes last. */
export const APPARATUS = ['reck', 'boden', 'schaukelringe', 'sprung', 'barren'] as const;
export type EgtApparatus = (typeof APPARATUS)[number];

const CATEGORIES: Record<Sex, readonly string[]> = {
  FEMALE: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'KD'],
  MALE: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'KH'],
};

const inputRuleSchema = z
  .object({
    attempts: z.number().int().min(1).max(4),
    aggregation: z.enum(['NONE', 'MAX', 'MIN', 'AVG']),
  })
  // No grade could be saved with several attempts that are not combined.
  .refine(({ attempts, aggregation }) => attempts === 1 || aggregation !== 'NONE');

const egtConfigSchema = z.object({
  /** Auszeichnung in percent, keyed by sex and category. */
  honourPercent: z.object({
    FEMALE: z.record(z.string(), z.number().min(0).max(100)),
    MALE: z.record(z.string(), z.number().min(0).max(100)),
  }),
  honourRounding: z.enum(['round', 'ceil']),
  precision: z.union([z.literal(2), z.literal(3)]),
  tieBreak: z.array(z.enum(APPARATUS)),
  /** Input rules by apparatus; `categories` overrides the default for single categories. */
  inputs: z.partialRecord(
    z.enum(APPARATUS),
    z.object({ default: inputRuleSchema, categories: z.record(z.string(), inputRuleSchema) }),
  ),
});
export type EgtConfig = z.infer<typeof egtConfigSchema>;

export const DEFAULT_HONOUR_PERCENT = 33;

function honourDefaults(sex: Sex) {
  return Object.fromEntries(CATEGORIES[sex].map((category) => [category, DEFAULT_HONOUR_PERCENT]));
}

export const egtModule: ContestModule<EgtConfig> = {
  key: 'egt',
  configSchema: egtConfigSchema,
  defaultConfig: {
    honourPercent: { FEMALE: honourDefaults('FEMALE'), MALE: honourDefaults('MALE') },
    honourRounding: 'round',
    precision: 2,
    tieBreak: ['boden', 'schaukelringe', 'sprung', 'barren', 'reck'],
    inputs: {
      sprung: {
        default: { attempts: 2, aggregation: 'MAX' },
        categories: {
          K6: { attempts: 2, aggregation: 'AVG' },
          K7: { attempts: 2, aggregation: 'AVG' },
        },
      },
    },
  },
  apparatus: (_config, sex) =>
    sex === 'MALE' ? APPARATUS : APPARATUS.filter((apparatus) => apparatus !== 'barren'),
  categories: (_config, sex) => CATEGORIES[sex],
  inputRule(config, apparatus, category) {
    const inputs = config.inputs[apparatus as EgtApparatus];
    return inputs?.categories[category] ?? inputs?.default ?? { attempts: 1, aggregation: 'NONE' };
  },
  rankingOptions: (config, category, sex) => ({
    tieBreak: config.tieBreak,
    precision: config.precision,
    honourPercent: config.honourPercent[sex][category] ?? DEFAULT_HONOUR_PERCENT,
    honourRounding: config.honourRounding,
  }),
};
