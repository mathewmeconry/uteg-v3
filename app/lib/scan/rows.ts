import jsQR from 'jsqr';
import { aggregate } from '~/lib/domain/grade';
import type { InputRule } from '~/modules/types';
import type { DigitModel } from './digits';
import { readGrade } from './grade';
import type { Gray, ScannedCell } from './sheet';

/** Attempts are written with two decimals, see PLAN.md. */
const ATTEMPT_PRECISION = 2;
export type ReadRow = { value?: number; attempts?: number[]; confidence: number };

/** The text of a straightened QR code, or null. */
export function readQrCode({ width, height, data }: Gray) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index++) {
    rgba.fill(data[index], index * 4, index * 4 + 3);
    rgba[index * 4 + 3] = 255;
  }
  return jsQR(rgba, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

/**
 * What a starter's cells of a sheet say: one per attempt of the sheet's columns, then the final
 * grade, or only the grade when the sheet has one column. Some judges only write the final grade,
 * then it is the reading. Null when nothing is written or a cell that is needed cannot be read. A
 * written final grade that matches the attempts makes the reading more likely.
 */
export function readRow(
  model: DigitModel,
  cells: readonly ScannedCell[],
  { inputRule, precision }: { inputRule: InputRule; precision: number },
): ReadRow | null {
  const final = cells.at(-1)!;
  if (inputRule.attempts === 1) {
    // On sheets with attempts, a starter with one may have written it into either column.
    const written = final.inked ? final : cells.length > 1 && cells[0].inked ? cells[0] : null;
    const grade = written && readGrade(model, written.image, precision);
    return grade && { value: grade.value, confidence: grade.confidence };
  }

  const attempts = cells.slice(0, inputRule.attempts);
  // Only without any attempt: a final next to missing ones would be saved without those written.
  if (attempts.every(({ inked }) => !inked)) {
    const grade = final.inked && readGrade(model, final.image, precision);
    return grade ? { value: grade.value, confidence: grade.confidence } : null;
  }
  if (!attempts.every(({ inked }) => inked)) return null;
  const read = attempts.map(({ image }) => readGrade(model, image, ATTEMPT_PRECISION));
  if (read.some((grade) => grade === null)) return null;
  const values = read.map((grade) => grade!.value);
  let confidence = read.reduce((product, grade) => product * grade!.confidence, 1);
  if (final.inked) {
    const written = readGrade(model, final.image, precision);
    if (written && written.value === aggregate(values, inputRule.aggregation)) {
      confidence = Math.max(confidence, written.confidence);
    }
  }
  return { attempts: values, confidence };
}
