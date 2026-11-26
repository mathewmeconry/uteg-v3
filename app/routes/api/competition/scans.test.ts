import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '~/lib/prisma.server';
import { MAX_CELL_BYTES, MAX_IMAGE_BYTES } from '~/lib/scans.server';
import { sheetCode } from '~/lib/sheetCode.server';
import { createCompetition, createDivision, createStarter, truncateTables } from '~/tests/helpers';
import { callRoute } from '~/tests/routes';
import { action, loader } from './scans';

beforeEach(truncateTables);

const PNG = new Uint8Array([137, 80, 78, 71]);

async function setup() {
  const { id, contest } = await createCompetition();
  const division = await createDivision(contest.id, { state: 'RUNNING' });
  const entryIds = [];
  for (const firstname of ['Anna', 'Bea']) {
    const { entry } = await createStarter(id, {
      firstname,
      divisionId: division.id,
      startApparatus: 'reck',
    });
    entryIds.push(entry.id);
  }
  const code = sheetCode({
    apparatus: 'reck',
    round: 0,
    divisionIds: [division.id],
    offset: 0,
    entryIds,
    attempts: 1,
  });
  return { id, code };
}

/** With the image at the same index as each row, by default a small one for each. */
function save(
  competitionId: string,
  code: string,
  rows: ({ row: number } & Record<string, unknown>)[],
  images = rows.map(() => PNG),
) {
  return callRoute(action, {
    competitionId,
    role: 'EDITOR',
    form: [
      ['code', code],
      ['rows', JSON.stringify(rows)],
      ...images.map((image, index): [string, Blob] => [
        `image-${rows[index].row}`,
        new Blob([image]),
      ]),
    ],
  });
}

describe('scans', () => {
  it('is for those who enter grades', async () => {
    const { id, code } = await setup();
    const search = `?${new URLSearchParams({ code })}`;
    expect((await callRoute(loader, { competitionId: id, role: 'VIEWER', search })).status).toBe(
      403,
    );
    const form: [string, string][] = [['code', code]];
    expect((await callRoute(action, { competitionId: id, role: 'VIEWER', form })).status).toBe(403);
    const { sheet } = await callRoute(loader, { competitionId: id, role: 'GRADE_ENTRY', search });
    expect(sheet.rows).toHaveLength(2);
  });

  it('gives the rows of a sheet and keeps what was read from it', async () => {
    const { id, code } = await setup();
    const search = `?${new URLSearchParams({ code })}`;
    const { sheet } = await callRoute(loader, { competitionId: id, role: 'EDITOR', search });
    expect(sheet.rows.map(({ firstname }: { firstname: string }) => firstname)).toEqual([
      'Anna',
      'Bea',
    ]);

    const { scanned } = await save(id, code, [{ row: 1, value: 9000, confidence: 0.5 }], [PNG]);
    expect(scanned).toHaveLength(1);
    expect(await prisma.scannedGrade.count()).toBe(1);

    const discarded = await callRoute(action, {
      competitionId: id,
      role: 'EDITOR',
      form: [
        ['intent', 'discard'],
        ['id', scanned[0].id],
      ],
    });
    expect(discarded).toEqual({ discarded: true });
    expect(await prisma.scannedGrade.count()).toBe(0);
  });

  it('keeps the ink of the cells, but not too much of it', async () => {
    const { id, code } = await setup();
    const send = (cell: Uint8Array<ArrayBuffer>, columns = 1) =>
      callRoute(action, {
        competitionId: id,
        role: 'EDITOR',
        form: [
          ['code', code],
          ['rows', JSON.stringify([{ row: 0, value: 9000, confidence: 1, columns }])],
          ['image-0', new Blob([PNG])],
          ['cell-0-0', new Blob([cell])],
          ['cellWidth', '600'],
          ['cellHeight', '160'],
        ],
      });
    await send(new Uint8Array([1, 2, 3]));
    const { cells, cellWidth } = await prisma.scannedGrade.findFirstOrThrow();
    expect(cells).toHaveLength(1);
    expect(cellWidth).toBe(600);
    expect((await send(new Uint8Array(MAX_CELL_BYTES + 1))).init?.status).toBe(400);
    // More columns than the sheet has: the last would not be the final grade's.
    expect((await send(new Uint8Array([1, 2, 3]), 2)).init?.status).toBe(400);
  });

  it('refuses missing or large images, repeated rows and more rows than a page', async () => {
    const { id, code } = await setup();
    const row = { row: 0, value: 9000, confidence: 1 };
    const statusOf = async (answer: Promise<{ init?: { status?: number } }>) =>
      (await answer).init?.status;
    expect(await statusOf(save(id, code, [row], []))).toBe(400);
    expect(await statusOf(save(id, code, [row], [new Uint8Array(MAX_IMAGE_BYTES + 1)]))).toBe(400);
    expect(await statusOf(save(id, code, [row, row], [PNG]))).toBe(400);
    const many = Array.from({ length: 19 }, (_, index) => ({ ...row, row: index }));
    expect(await statusOf(save(id, code, many))).toBe(400);
    expect(await prisma.scannedGrade.count()).toBe(0);
  });
});
