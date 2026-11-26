import {
  createCompetition,
  createDivision,
  createStarter,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import { stopDivisions } from './divisions.server';
import { getGradingState, saveGrades } from './judging.server';
import { prisma } from './prisma.server';
import {
  discardScannedGrade,
  getScanImage,
  getScannedSheet,
  MAX_IMAGE_BYTES,
  saveScannedGrades,
} from './scans.server';
import { sheetCode } from './sheetCode.server';

beforeEach(truncateTables);

const IMAGE = new Uint8Array([137, 80, 78, 71]);

/** K5 has two attempts on vault, one elsewhere. */
async function setup(apparatus = 'reck', attempts = apparatus === 'sprung' ? 2 : 1) {
  const { id, contest } = await createCompetition();
  const division = await createDivision(contest.id, { state: 'RUNNING' });
  const starters = [];
  for (const firstname of ['Anna', 'Bea', 'Cleo']) {
    starters.push(
      await createStarter(id, { firstname, divisionId: division.id, startApparatus: apparatus }),
    );
  }
  const code = sheetCode({
    apparatus,
    round: 0,
    divisionIds: [division.id],
    offset: 0,
    entryIds: starters.map(({ entry }) => entry.id),
    attempts,
  });
  return { id, contest, division, starters, code };
}

async function scannedOf(competitionId: string, divisionId: string, apparatus = 'reck') {
  const { apparatus: lists } = await getGradingState(competitionId, { divisionIds: [divisionId] });
  const slots = lists.find((item) => item.apparatus === apparatus)!.rounds[0].slots;
  return slots.map(({ scanned }) => scanned);
}

describe('getScannedSheet', () => {
  it('gives the rows of the printed page', async () => {
    const { id, code } = await setup();
    const sheet = await getScannedSheet(id, code);
    expect(sheet.apparatus).toBe('reck');
    expect(sheet.attempts).toBe(1);
    expect(sheet.rows.map(({ firstname }) => firstname)).toEqual(['Anna', 'Bea', 'Cleo']);
  });

  it('refuses lists that changed since printing, and foreign or unknown codes', async () => {
    const { id, starters, code } = await setup();
    const other = await createCompetition();
    expect(await errorCode(getScannedSheet(other.id, code))).toBe('NOT_FOUND');
    expect(await errorCode(getScannedSheet(id, 'https://example.com'))).toBe('NOT_FOUND');
    // Anna moved to the end of the lineup.
    await prisma.entry.update({ where: { id: starters[0].entry.id }, data: { position: 999 } });
    expect(await errorCode(getScannedSheet(id, code))).toBe('SHEET_CHANGED');
  });

  it('refuses sheets printed with other columns of attempts', async () => {
    // As if the rule changed from 1 to 2 attempts after printing.
    const { id, code } = await setup('sprung', 1);
    expect(await errorCode(getScannedSheet(id, code))).toBe('SHEET_CHANGED');
  });

  it('only takes running divisions, whose grading page shows scans', async () => {
    const { id, division, code } = await setup();
    await prisma.division.update({ where: { id: division.id }, data: { state: 'ENDED' } });
    expect(await errorCode(getScannedSheet(id, code))).toBe('DIVISION_NOT_RUNNING');
  });
});

describe('saveScannedGrades', () => {
  it('keeps the readings until a grade is saved', async () => {
    const { id, division, starters, code } = await setup();
    const kept = await saveScannedGrades(id, code, [
      { row: 0, value: 9350, confidence: 0.95, image: IMAGE },
      { row: 2, value: 8700, confidence: 0.4, image: IMAGE },
    ]);
    const [anna, bea, cleo] = await scannedOf(id, division.id);
    expect(kept).toEqual([
      { row: 0, id: anna?.id },
      { row: 2, id: cleo?.id },
    ]);
    expect(anna).toMatchObject({ value: 9350, attempts: [], confidence: 0.95 });
    expect(bea).toBeNull();
    expect(cleo?.value).toBe(8700);
    expect(await getScanImage(id, anna!.id)).toEqual(IMAGE);

    await saveGrades(
      id,
      [{ entryId: starters[0].entry.id, apparatus: 'reck', value: 9350, version: null }],
      { kind: 'editor' },
    );
    expect((await scannedOf(id, division.id))[0]).toBeNull();
  });

  it('leaves out grades that are saved like that already', async () => {
    const { id, starters, code } = await setup();
    await saveGrades(
      id,
      [{ entryId: starters[0].entry.id, apparatus: 'reck', value: 9350, version: null }],
      { kind: 'editor' },
    );
    const kept = await saveScannedGrades(id, code, [
      { row: 0, value: 9350, confidence: 1, image: IMAGE },
    ]);
    expect(kept).toEqual([]);
  });

  it('replaces an earlier scan with a new one', async () => {
    const { id, division, code } = await setup();
    await saveScannedGrades(id, code, [{ row: 1, value: 9000, confidence: 1, image: IMAGE }]);
    const [, before] = await scannedOf(id, division.id);
    await saveScannedGrades(id, code, [{ row: 1, value: 9100, confidence: 1, image: IMAGE }]);
    const [, after] = await scannedOf(id, division.id);
    expect(after?.value).toBe(9100);
    // So that the image is not taken from the cache.
    expect(after?.id).not.toBe(before?.id);
    expect(await prisma.scannedGrade.count()).toBe(1);
  });

  it('computes the final grade from attempts', async () => {
    const { id, division, code } = await setup('sprung');
    await saveScannedGrades(id, code, [
      { row: 0, attempts: [9100, 9350], confidence: 1, image: IMAGE },
    ]);
    const [anna] = await scannedOf(id, division.id, 'sprung');
    expect(anna).toMatchObject({ value: 9350, attempts: [9100, 9350] });
  });

  it('leaves out withdrawn starters and refuses what is no grade', async () => {
    const { id, division, starters, code } = await setup();
    await prisma.entry.update({
      where: { id: starters[1].entry.id },
      data: { withdrawnAt: new Date() },
    });
    expect(
      await saveScannedGrades(id, code, [{ row: 1, value: 9000, confidence: 1, image: IMAGE }]),
    ).toEqual([]);
    expect((await scannedOf(id, division.id))[1]).toBeNull();
    const scan = (row: number, value: number) =>
      saveScannedGrades(id, code, [{ row, value, confidence: 1, image: IMAGE }]);
    expect(await errorCode(scan(0, 12000))).toBe('INVALID_GRADE');
    expect(await errorCode(scan(5, 9000))).toBe('INVALID_INPUT');
  });

  it('refuses repeated rows, large images and impossible confidences', async () => {
    const { id, code } = await setup();
    const row = { row: 0, value: 9000, confidence: 1, image: IMAGE };
    expect(await errorCode(saveScannedGrades(id, code, [row, row]))).toBe('INVALID_INPUT');
    const large = new Uint8Array(MAX_IMAGE_BYTES + 1);
    expect(await errorCode(saveScannedGrades(id, code, [{ ...row, image: large }]))).toBe(
      'INVALID_INPUT',
    );
    expect(await errorCode(saveScannedGrades(id, code, [{ ...row, confidence: 2 }]))).toBe(
      'INVALID_INPUT',
    );
  });

  it('is removed when its division stops, as nobody could check it', async () => {
    const { id, division, code } = await setup();
    await saveScannedGrades(id, code, [{ row: 0, value: 9000, confidence: 1, image: IMAGE }]);
    await stopDivisions(id, [division.id]);
    expect(await prisma.scannedGrade.count()).toBe(0);
  });

  it('is removed when a judge saves the grade', async () => {
    const { id, division, starters, code } = await setup();
    await saveScannedGrades(id, code, [{ row: 0, value: 9000, confidence: 1, image: IMAGE }]);
    await saveGrades(
      id,
      [{ entryId: starters[0].entry.id, apparatus: 'reck', value: 9100, version: null }],
      { kind: 'judge', ground: division.ground, apparatus: 'reck' },
    );
    expect((await scannedOf(id, division.id))[0]).toBeNull();
  });
});

describe('discardScannedGrade', () => {
  it('only discards scans of the competition', async () => {
    const { id, division, code } = await setup();
    await saveScannedGrades(id, code, [{ row: 0, value: 9000, confidence: 1, image: IMAGE }]);
    const [anna] = await scannedOf(id, division.id);
    const other = await createCompetition();
    await discardScannedGrade(other.id, anna!.id);
    expect(await getScanImage(other.id, anna!.id)).toBeNull();
    expect(await prisma.scannedGrade.count()).toBe(1);
    await discardScannedGrade(id, anna!.id);
    expect(await prisma.scannedGrade.count()).toBe(0);
  });
});
