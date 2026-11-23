import { aggregate, formatGrade, isAttempt, parseGrade, roundGrade } from './grade';

describe('parseGrade', () => {
  it.each([
    ['9,55', 9550],
    ['9.55', 9550],
    ['9.225', 9225],
    [' 8 ', 8000],
    ['0', 0],
    ['0,0', 0],
    ['10', 10000],
    ['10.000', 10000],
    [',5', 500],
    ['9.', 9000],
  ])('parses "%s"', (input, value) => {
    expect(parseGrade(input)).toEqual({ ok: true, value });
  });

  it.each(['', '   '])('treats "%s" as no grade', (input) => {
    expect(parseGrade(input)).toEqual({ ok: true, value: null });
  });

  it.each([
    ['abc', 'INVALID'],
    ['9.5.5', 'INVALID'],
    ['1e1', 'INVALID'],
    ['NaN', 'INVALID'],
    ['.', 'INVALID'],
    ['-1', 'RANGE'],
    ['10.001', 'RANGE'],
    ['11', 'RANGE'],
    ['95', 'RANGE'],
    ['9.5555', 'PRECISION'],
  ])('rejects "%s" as %s', (input, error) => {
    expect(parseGrade(input)).toEqual({ ok: false, error });
  });
});

describe('attempts', () => {
  it('have at most two decimals', () => {
    expect(parseGrade('9.22', 2)).toEqual({ ok: true, value: 9220 });
    expect(parseGrade('9.225', 2)).toEqual({ ok: false, error: 'PRECISION' });
    expect([0, 9220, 10000].every(isAttempt)).toBe(true);
    expect([9225, -10, 10010, 9.5].some(isAttempt)).toBe(false);
  });

  it('are averaged without rounding twice', () => {
    // 9.0045 would become 9.005 and then 9.01.
    expect(roundGrade(aggregate([9000, 9000], 'AVG')!, 2)).toBe(9000);
    expect(roundGrade(aggregate([9000, 9010], 'AVG')!, 2)).toBe(9010);
  });
});

describe('roundGrade and formatGrade', () => {
  it.each([
    [9225, 2, 9230, '9.23'],
    [9224, 2, 9220, '9.22'],
    [1005, 2, 1010, '1.01'],
    [9225, 3, 9225, '9.225'],
    [10000, 2, 10000, '10.00'],
    [0, 2, 0, '0.00'],
    [45035, 2, 45040, '45.04'],
  ] as const)('rounds %i to %i decimals', (value, decimals, rounded, text) => {
    expect(roundGrade(value, decimals)).toBe(rounded);
    expect(formatGrade(value, decimals)).toBe(text);
  });
});

describe('aggregate', () => {
  it('takes the best attempt, zero is valid', () => {
    expect(aggregate([0, 9100], 'MAX')).toBe(9100);
    expect(aggregate([0, 0], 'MAX')).toBe(0);
  });

  it('takes the worst attempt', () => {
    expect(aggregate([0, 9100], 'MIN')).toBe(0);
  });

  it('averages to thousandths, half up', () => {
    expect(aggregate([9100, 9205], 'AVG')).toBe(9153);
    expect(aggregate([9100, 9200, 9200], 'AVG')).toBe(9167);
    expect(aggregate([0, 9000], 'AVG')).toBe(4500);
  });

  it('keeps a single value', () => {
    expect(aggregate([9100], 'NONE')).toBe(9100);
  });

  it('cannot combine several values without an aggregation', () => {
    expect(aggregate([9100, 9200], 'NONE')).toBeNull();
  });

  it('is null without attempts', () => {
    expect(aggregate([], 'MAX')).toBeNull();
  });
});
