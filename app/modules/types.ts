import type { z } from 'zod';

export const SEXES = ['FEMALE', 'MALE'] as const;
export type Sex = (typeof SEXES)[number];

export type Aggregation = 'NONE' | 'MAX' | 'MIN' | 'AVG';

/** How a grade is entered: one value, or several attempts combined into one. */
export type InputRule = { attempts: number; aggregation: Aggregation };

export type GradePrecision = {
  /** Decimals each grade is rounded to before summing. */
  precision: 2 | 3;
  /** Apparatus whose grade is an average of attempts. It always counts in thousandths. */
  averaged: readonly string[];
  /** Decimals averages, and totals with one, are shown with. At least `precision`. */
  averageDecimals: 2 | 3;
};

export type RankingOptions = GradePrecision & {
  /** Apparatus compared in order when totals are equal. Only orders the list, ranks stay shared. */
  tieBreak: readonly string[];
  /** Share of the ranked entries, in percent, that get a medal or an Auszeichnung. */
  honourPercent: number;
  honourRounding: 'round' | 'ceil';
};

/**
 * A competition format. Everything the judging engine must know about it; entries, divisions,
 * rotation and grades are shared by all modules. Must stay free of server imports.
 */
export type ContestModule<Config = unknown> = {
  key: string;
  configSchema: z.ZodType<Config>;
  defaultConfig: Config;
  /** Apparatus in rotation order. Also the number of rounds. */
  apparatus(config: Config, sex: Sex): readonly string[];
  categories(config: Config, sex: Sex): readonly string[];
  inputRule(config: Config, apparatus: string, category: string): InputRule;
  rankingOptions(config: Config, category: string, sex: Sex): RankingOptions;
};
