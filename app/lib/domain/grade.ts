import type { Aggregation } from '~/modules/types';

export const MAX_GRADE = 10_000;

export type ParsedGrade =
  { ok: true; value: number | null } | { ok: false; error: 'INVALID' | 'RANGE' | 'PRECISION' };

/** Turns user input into thousandths. Empty input is no grade. */
export function parseGrade(input: string): ParsedGrade {
  const text = input.trim().replace(',', '.');
  if (text === '') return { ok: true, value: null };

  const match = /^(-?)(\d*)\.?(\d*)$/.exec(text);
  if (!match || (!match[2] && !match[3])) return { ok: false, error: 'INVALID' };

  const [, sign, whole, decimals] = match;
  if (decimals.length > 3) return { ok: false, error: 'PRECISION' };
  const value = Number(whole) * 1000 + Number(decimals.padEnd(3, '0'));
  if (sign || value > MAX_GRADE) return { ok: false, error: 'RANGE' };
  return { ok: true, value };
}

export function isGrade(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_GRADE;
}

/** Rounds thousandths half up. */
export function roundGrade(thousandths: number, decimals: 2 | 3) {
  return decimals === 3 ? thousandths : Math.floor((thousandths + 5) / 10) * 10;
}

export function formatGrade(thousandths: number, decimals: 2 | 3) {
  const rounded = roundGrade(thousandths, decimals);
  const fraction = String(rounded % 1000).padStart(3, '0');
  return `${Math.floor(rounded / 1000)}.${fraction.slice(0, decimals)}`;
}

/** The final grade of several attempts. Null when they cannot be combined. */
export function aggregate(attempts: readonly number[], aggregation: Aggregation): number | null {
  if (attempts.length === 0) return null;
  switch (aggregation) {
    case 'MAX':
      return Math.max(...attempts);
    case 'MIN':
      return Math.min(...attempts);
    case 'AVG': {
      const sum = attempts.reduce((total, attempt) => total + attempt, 0);
      return Math.floor((2 * sum + attempts.length) / (2 * attempts.length));
    }
    case 'NONE':
      return attempts.length === 1 ? attempts[0] : null;
  }
}
