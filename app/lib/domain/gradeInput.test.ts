import type { InputRule } from '~/modules/types';
import { evaluateFields, isSameGrade, toFields } from './gradeInput';

const SINGLE: InputRule = { attempts: 1, aggregation: 'NONE' };
const BEST: InputRule = { attempts: 2, aggregation: 'MAX' };
const AVERAGE: InputRule = { attempts: 2, aggregation: 'AVG' };

describe('toFields', () => {
  it('shows a grade without attempts as final', () => {
    expect(toFields({ value: 9200, attempts: [] }, SINGLE)).toEqual({
      attempts: [],
      final: '9.20',
    });
    expect(toFields({ value: 9225, attempts: [] }, BEST)).toEqual({
      attempts: ['', ''],
      final: '9.225',
    });
  });

  it('shows the attempts, the final grade follows from them', () => {
    expect(toFields({ value: 9200, attempts: [0, 9200] }, BEST)).toEqual({
      attempts: ['0.00', '9.20'],
      final: '',
    });
  });

  it('is empty without a grade', () => {
    expect(toFields(null, SINGLE)).toEqual({ attempts: [], final: '' });
    expect(toFields(null, BEST)).toEqual({ attempts: ['', ''], final: '' });
  });
});

describe('evaluateFields', () => {
  it.each([
    ['9,25', 9250],
    ['10', 10000],
    ['0', 0],
  ])('reads %s', (final, value) => {
    const result = evaluateFields({ attempts: [], final }, SINGLE);
    expect(result.grade).toEqual({ value, attempts: [] });
    expect(result.isEmpty).toBe(false);
  });

  it.each([
    ['925', 'RANGE'],
    ['9..2', 'INVALID'],
    ['9.2255', 'PRECISION'],
  ])('rejects %s', (final, error) => {
    expect(evaluateFields({ attempts: [], final }, SINGLE)).toMatchObject({
      grade: null,
      isEmpty: false,
      errors: { final: error },
    });
  });

  it('is empty without input', () => {
    expect(evaluateFields({ attempts: ['', ' '], final: '' }, BEST)).toMatchObject({
      grade: null,
      isEmpty: true,
      usesAttempts: false,
    });
  });

  it.each([
    [BEST, 9200],
    [AVERAGE, 9150],
  ])('computes the final grade for %j', (rule, value) => {
    expect(evaluateFields({ attempts: ['9.1', '9,2'], final: '' }, rule)).toMatchObject({
      grade: { value, attempts: [9100, 9200] },
      usesAttempts: true,
    });
  });

  it('needs every attempt, zero counts', () => {
    expect(evaluateFields({ attempts: ['9.1', ''], final: '' }, BEST)).toMatchObject({
      grade: null,
      errors: { attempts: [null, 'REQUIRED'], final: null },
    });
    expect(evaluateFields({ attempts: ['9.1', '0'], final: '' }, AVERAGE).grade?.value).toBe(4550);
  });

  it('takes the final grade directly while the attempts are empty', () => {
    expect(evaluateFields({ attempts: ['', ''], final: '9.4' }, BEST).grade).toEqual({
      value: 9400,
      attempts: [],
    });
  });
});

describe('isSameGrade', () => {
  it('compares value and attempts', () => {
    const grade = { value: 9200, attempts: [9100, 9200] };
    expect(isSameGrade(grade, { ...grade })).toBe(true);
    expect(isSameGrade(grade, { value: 9200, attempts: [] })).toBe(false);
    expect(isSameGrade(grade, { value: 9200, attempts: [9200, 9100] })).toBe(false);
    expect(isSameGrade(null, grade)).toBe(false);
    expect(isSameGrade(null, null)).toBe(true);
  });
});
