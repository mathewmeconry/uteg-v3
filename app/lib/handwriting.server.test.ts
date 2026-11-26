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

it('keeps the cells of a grade checked against its handwriting', async () => {
  const { id, entryId, code } = await setup();
  const row = { row: 0, value: 9300, confidence: 0.5, image: IMAGE, cells: [INK] };
  const [{ id: scanId }] = await saveScannedGrades(id, code, [row], SIZE);
  const input = { entryId, apparatus: 'reck', value: 9350, version: null, scanId };
  await saveGrades(id, [input], EDITOR);

  const [sample] = await listHandwritingSamples(id);
  expect(sample).toMatchObject({ written: '9.35', isRead: false });
  expect(sample.image).toMatchObject(SIZE);
  expect(Array.from(sample.image.data)).toEqual([
    0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0,
  ]);
  // Not linked to the starter.
  expect(Object.keys(await prisma.handwritingSample.findFirstOrThrow())).not.toContain('entryId');
});

it('gives each attempt its value, but not the computed final grade', async () => {
  const { id, entryId, code } = await setup('sprung');
  // The judge's final grade may be other than the one computed from the attempts.
  const row = {
    row: 0,
    attempts: [9100, 9350],
    confidence: 1,
    image: IMAGE,
    cells: [INK, INK, INK],
  };
  const [{ id: scanId }] = await saveScannedGrades(id, code, [row], SIZE);
  await saveGrades(id, [{ entryId, apparatus: 'sprung', attempts: [9100, 9350], scanId }], EDITOR);
  const samples = await listHandwritingSamples(id);
  expect(samples.map(({ written, isRead }) => [written, isRead]).toSorted()).toEqual([
    ['9.10', true],
    ['9.35', true],
  ]);
});

it('keeps nothing from grades typed elsewhere or saved by a judge', async () => {
  const { id, division, entryId, code } = await setup();
  const row = { row: 0, value: 9300, confidence: 1, image: IMAGE, cells: [INK] };
  await saveScannedGrades(id, code, [row], SIZE);
  // Maybe a correction, not what is written.
  await saveGrades(id, [{ entryId, apparatus: 'reck', value: 9200, version: null }], EDITOR);
  const [{ id: scanId }] = await saveScannedGrades(id, code, [row], SIZE);
  const judge: GradeScope = { kind: 'judge', ground: division.ground, apparatus: 'reck' };
  await saveGrades(id, [{ entryId, apparatus: 'reck', value: 9300, version: 1, scanId }], judge);
  expect(await prisma.handwritingSample.count()).toBe(0);
});

it('keeps nothing when the competition does not want it, and drops what it kept', async () => {
  const { id, entryId, code } = await setup();
  const row = { row: 0, value: 9300, confidence: 1, image: IMAGE, cells: [INK] };
  const [first] = await saveScannedGrades(id, code, [row], SIZE);
  await saveGrades(id, [{ entryId, apparatus: 'reck', value: 9300, scanId: first.id }], EDITOR);
  expect(await prisma.handwritingSample.count()).toBe(1);

  await setKeepHandwriting(id, false);
  expect(await prisma.handwritingSample.count()).toBe(0);
  const [second] = await saveScannedGrades(id, code, [{ ...row, value: 9400 }], SIZE);
  expect((await prisma.scannedGrade.findFirstOrThrow()).cells).toEqual([]);
  await saveGrades(id, [{ entryId, apparatus: 'reck', value: 9400, scanId: second.id }], EDITOR);
  expect(await prisma.handwritingSample.count()).toBe(0);
});
