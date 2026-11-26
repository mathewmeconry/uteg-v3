import { deflateSync } from 'node:zlib';
import { createCompetition, createDivision, createStarter, truncateTables } from '~/tests/helpers';
import { listHandwritingSamples, setKeepHandwriting } from './handwriting.server';
import { saveGrades, type GradeScope } from './judging.server';
import { prisma } from './prisma.server';
import { saveScannedGrades } from './scans.server';
import { sheetCode } from './sheetCode.server';

beforeEach(truncateTables);

const IMAGE = new Uint8Array([137, 80, 78, 71]);
const EDITOR: GradeScope = { kind: 'editor' };
/** 8 × 2 pixels: ink at the top left and the bottom right. */
const SIZE = { width: 8, height: 2 };
const INK = new Uint8Array(deflateSync(Uint8Array.from([0b10000000, 0b00000001])));

/** One starter, on vault with two attempts or elsewhere with one. */
async function setup(apparatus = 'reck') {
  const { id, contest } = await createCompetition();
  const division = await createDivision(contest.id, { state: 'RUNNING' });
  const { entry } = await createStarter(id, { divisionId: division.id, startApparatus: apparatus });
  const code = sheetCode({
    apparatus,
    round: 0,
    divisionIds: [division.id],
    offset: 0,
    entryIds: [entry.id],
    attempts: apparatus === 'sprung' ? 2 : 1,
  });
  return { id, division, entryId: entry.id, code };
}

it('keeps the cells of a checked grade with what is written in them', async () => {
  const { id, entryId, code } = await setup();
  const row = { row: 0, value: 9300, confidence: 0.5, image: IMAGE, cells: [INK] };
  await saveScannedGrades(id, code, [row], SIZE);
  await saveGrades(id, [{ entryId, apparatus: 'reck', value: 9350, version: null }], EDITOR);

  const [sample] = await listHandwritingSamples(id);
  expect(sample).toMatchObject({ written: '9.35', isRead: false });
  expect(sample.image).toMatchObject(SIZE);
  expect(Array.from(sample.image.data)).toEqual([
    0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0,
  ]);
  // Not linked to the starter.
  expect(Object.keys(await prisma.handwritingSample.findFirstOrThrow())).not.toContain('entryId');
});

it('gives each attempt its value and the last column the final grade', async () => {
  const { id, entryId, code } = await setup('sprung');
  const row = {
    row: 0,
    attempts: [9100, 9350],
    confidence: 1,
    image: IMAGE,
    // Nothing written as the final grade.
    cells: [INK, INK, new Uint8Array()],
  };
  await saveScannedGrades(id, code, [row], SIZE);
  await saveGrades(id, [{ entryId, apparatus: 'sprung', attempts: [9100, 9350] }], EDITOR);
  const samples = await listHandwritingSamples(id);
  expect(samples.map(({ written, isRead }) => [written, isRead]).toSorted()).toEqual([
    ['9.10', true],
    ['9.35', true],
  ]);
});

it('keeps nothing when a judge saves the grade, or when the competition does not want it', async () => {
  const { id, division, entryId, code } = await setup();
  const row = { row: 0, value: 9300, confidence: 1, image: IMAGE, cells: [INK] };
  await saveScannedGrades(id, code, [row], SIZE);
  const judge: GradeScope = { kind: 'judge', ground: division.ground, apparatus: 'reck' };
  await saveGrades(id, [{ entryId, apparatus: 'reck', value: 9300, version: null }], judge);
  expect(await prisma.handwritingSample.count()).toBe(0);

  await setKeepHandwriting(id, false);
  await saveScannedGrades(id, code, [{ ...row, value: 9400 }], SIZE);
  expect((await prisma.scannedGrade.findFirstOrThrow()).cells).toEqual([]);
  await saveGrades(id, [{ entryId, apparatus: 'reck', value: 9400, version: 1 }], EDITOR);
  expect(await prisma.handwritingSample.count()).toBe(0);
});
