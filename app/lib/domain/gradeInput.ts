import type { InputRule } from '~/modules/types';
import { aggregate, formatGrade, parseGrade } from './grade';

/** Thousandths. Without attempts the final grade was entered directly. */
export type StoredGrade = { value: number; attempts: number[] };

/** What was typed. The final grade is only used while all attempts are empty. */
export type GradeFields = { attempts: string[]; final: string };

type FieldErrorCode = 'INVALID' | 'RANGE' | 'PRECISION' | 'ATTEMPT_PRECISION' | 'REQUIRED';

export type EvaluatedFields = {
  /** Null while something is missing or wrong. */
  grade: StoredGrade | null;
  isEmpty: boolean;
  usesAttempts: boolean;
  errors: { attempts: (FieldErrorCode | null)[]; final: FieldErrorCode | null };
};

export function toFields(grade: StoredGrade | null, rule: InputRule): GradeFields {
  const attempts = Array.from({ length: countAttempts(rule) }, (_, index) => {
    const attempt = grade?.attempts[index];
    return attempt === undefined ? '' : formatEntered(attempt);
  });
  const isDirect = grade !== null && attempts.every((attempt) => attempt === '');
  return { attempts, final: isDirect ? formatEntered(grade.value) : '' };
}

export function evaluateFields(fields: GradeFields, rule: InputRule): EvaluatedFields {
  const attempts = fields.attempts
    .slice(0, countAttempts(rule))
    .map((attempt) => parseGrade(attempt, 2));
  const usesAttempts = fields.attempts.some((attempt) => attempt.trim() !== '');
  const final = parseGrade(fields.final);

  if (!usesAttempts) {
    return {
      grade: final.ok && final.value !== null ? { value: final.value, attempts: [] } : null,
      isEmpty: final.ok && final.value === null,
      usesAttempts,
      errors: { attempts: attempts.map(() => null), final: final.ok ? null : final.error },
    };
  }
  const values = attempts.flatMap((attempt) =>
    attempt.ok && attempt.value !== null ? [attempt.value] : [],
  );
  const isComplete = values.length === rule.attempts && fields.attempts.length === rule.attempts;
  const value = isComplete ? aggregate(values, rule.aggregation) : null;
  return {
    grade: value === null ? null : { value, attempts: values },
    isEmpty: false,
    usesAttempts,
    errors: {
      attempts: attempts.map((attempt) => {
        if (!attempt.ok) {
          return attempt.error === 'PRECISION' ? 'ATTEMPT_PRECISION' : attempt.error;
        }
        return attempt.value === null ? 'REQUIRED' : null;
      }),
      final: null,
    },
  };
}

export function isSameGrade(a: StoredGrade | null, b: StoredGrade | null) {
  if (a === null || b === null) return a === b;
  return (
    a.value === b.value &&
    a.attempts.length === b.attempts.length &&
    a.attempts.every((attempt, index) => attempt === b.attempts[index])
  );
}

/** Two decimals, three only when the third one counts. */
export function formatEntered(thousandths: number) {
  return formatGrade(thousandths, thousandths % 10 === 0 ? 2 : 3);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A single attempt is entered as the final grade. */
function countAttempts(rule: InputRule) {
  return rule.attempts > 1 ? rule.attempts : 0;
}
