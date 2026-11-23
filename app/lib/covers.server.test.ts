import { createCompetition, errorCode, truncateTables } from '~/tests/helpers';
import { createJpeg, createPng } from '~/tests/images';
import { findBrokenCovers, removeCover, setCover } from './covers.server';
import { prisma } from './prisma.server';
import {
  createRankingTemplate,
  deleteRankingTemplate,
  duplicateRankingTemplate,
  getRankingTemplate,
  listRankingTemplates,
} from './rankingTemplates.server';

beforeEach(truncateTables);

const WIDE = createJpeg(200, 100);
const HIGH = createJpeg(100, 200);

async function setup() {
  const { id } = await createCompetition();
  const { id: templateId } = await createRankingTemplate(id, { name: 'A', options: {} });
  const set = (...files: Uint8Array[]) => setCover(id, templateId, files);
  const read = async (of = templateId) => (await getRankingTemplate(id, of)).cover;
  return { id, templateId, set, read };
}

describe('setCover', () => {
  it('stores the pages in order', async () => {
    const { id, set, read } = await setup();
    await set(WIDE, HIGH, WIDE, HIGH);
    const size = (cover: { width: number; height: number }[]) =>
      cover.map(({ width, height }) => [width, height]);
    expect(size(await read())).toEqual([
      [200, 100],
      [100, 200],
      [200, 100],
      [100, 200],
    ]);
    expect((await read())[0].data).toEqual(WIDE);

    const [{ coverPages }] = await listRankingTemplates(id);
    const assets = await prisma.asset.findMany({ orderBy: { position: 'asc' } });
    expect(assets.map((asset) => asset.id)).toEqual(coverPages);
    expect(assets.map(({ mimeType }) => mimeType)).toEqual(Array(4).fill('image/jpeg'));
  });

  it.each([
    ['nothing', [], 'INVALID_COVER'],
    ['an empty file', [new Uint8Array()], 'INVALID_COVER'],
    ['a PDF', [new TextEncoder().encode('%PDF-1.7')], 'INVALID_COVER'],
    ['a PNG', [createPng()], 'INVALID_COVER'],
    ['too many pixels', [createJpeg(3001, 10)], 'INVALID_COVER'],
    ['a broken page', [WIDE, HIGH.slice(0, -2)], 'INVALID_COVER'],
    ['too many pages', [WIDE, WIDE, WIDE, WIDE, WIDE], 'COVER_TOO_MANY_PAGES'],
    ['a large page', [createJpeg(200, 100, { scanBytes: 2 * 1024 * 1024 })], 'FILE_TOO_LARGE'],
  ])('rejects %s and keeps the old cover', async (_name, files, code) => {
    const { set, read } = await setup();
    await set(WIDE);
    expect(await errorCode(set(...files))).toBe(code);
    expect(await read()).toHaveLength(1);
  });

  it('only changes templates of the competition', async () => {
    const { templateId, set, read } = await setup();
    const other = await createCompetition();
    await set(WIDE);
    expect(await errorCode(setCover(other.id, templateId, [HIGH]))).toBe('NOT_FOUND');
    expect(await errorCode(removeCover(other.id, templateId))).toBe('NOT_FOUND');
    expect((await read())[0].width).toBe(200);
  });
});

describe('stored covers', () => {
  it('leave nothing behind when replaced or removed', async () => {
    const { id, templateId, set, read } = await setup();
    await set(WIDE, WIDE);
    await set(HIGH);
    expect(await prisma.asset.count()).toBe(1);
    await removeCover(id, templateId);
    expect(await read()).toEqual([]);
    expect(await prisma.asset.count()).toBe(0);
  });

  it('are copied with the template and deleted with it', async () => {
    const { id, templateId, set, read } = await setup();
    await set(WIDE, HIGH);
    await duplicateRankingTemplate(id, templateId, 'B');
    expect(await prisma.asset.count()).toBe(4);

    await deleteRankingTemplate(id, templateId);
    expect(await prisma.asset.count()).toBe(2);
    const [copy] = await listRankingTemplates(id);
    expect((await read(copy.id)).map(({ width }) => width)).toEqual([200, 100]);

    await prisma.competition.delete({ where: { id } });
    expect(await prisma.asset.count()).toBe(0);
  });

  it.each([
    ['another file', createPng()],
    ['cut off', WIDE.slice(0, -10)],
    ['empty', new Uint8Array()],
  ])('are left out and reported when they are %s', async (_name, data) => {
    const { id, templateId, set, read } = await setup();
    const other = await setup();
    await set(WIDE, HIGH);
    await other.set(WIDE);
    expect(await findBrokenCovers(id)).toEqual(new Set());
    await prisma.asset.updateMany({ where: { templateId, position: 0 }, data: { data } });
    expect((await read()).map(({ width }) => width)).toEqual([100]);
    expect(await findBrokenCovers(id)).toEqual(new Set([templateId]));
    expect(await findBrokenCovers(other.id)).toEqual(new Set());
  });
});
