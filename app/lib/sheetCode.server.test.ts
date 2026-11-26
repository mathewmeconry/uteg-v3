import { describe, expect, it } from 'vitest';
import { parseSheetCode, rowsHash, sheetCode } from './sheetCode.server';

describe('sheetCode', () => {
  const page = {
    apparatus: 'sprung',
    round: 2,
    divisionIds: ['B', 'A'],
    offset: 18,
    entryIds: ['e1', 'e2'],
  };

  it('holds the list, the first row and the divisions', () => {
    expect(sheetCode(page)).toMatch(/^UTEG1\/SPRUNG\/2\/18\/[0-9A-F]{8}\/A\.B$/);
  });

  it('changes when the rows change', () => {
    const code = sheetCode(page);
    expect(sheetCode({ ...page, entryIds: ['e2', 'e1'] })).not.toBe(code);
    expect(sheetCode({ ...page, entryIds: ['e1'] })).not.toBe(code);
  });

  it('is read back', () => {
    expect(parseSheetCode(sheetCode(page))).toEqual({
      apparatus: 'sprung',
      round: 2,
      offset: 18,
      hash: rowsHash(page.entryIds),
      divisionIds: ['A', 'B'],
    });
    expect(parseSheetCode('https://example.com')).toBeNull();
    expect(parseSheetCode('UTEG1/SPRUNG/2/18/XYZ/A')).toBeNull();
  });
});
