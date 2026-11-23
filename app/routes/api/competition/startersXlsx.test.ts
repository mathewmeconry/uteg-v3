import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseSheet } from '~/lib/domain/starterImport';
import { withdrawStarters } from '~/lib/starters.server';
import {
  addMember,
  createClub,
  createCompetition,
  createDivision,
  createStarter,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { callRoute } from '~/tests/starterRoutes';
import { action, loader } from './startersXlsx';

beforeEach(truncateTables);

async function read(response: Response) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook.worksheets[0];
}

const post = (userId: string | null, competitionId: string, ids: string[]) =>
  callRoute(action, {
    layout: 'api',
    userId,
    competitionId,
    body: new URLSearchParams(ids.map((id) => ['id', id])),
  });

describe('starters.xlsx', () => {
  it('exports all columns of the given starters in the given order', async () => {
    const competition = await createCompetition();
    const viewer = await createUser();
    await addMember(competition.id, viewer.id, 'VIEWER');
    const club = await createClub({ name: 'TV Chur', location: 'Chur' });
    const division = await createDivision(competition.contest.id, { number: 3 });
    const person = { clubId: club.id, lastname: 'Muster', birthYear: 2010 };
    const anna = await createStarter(competition.id, {
      ...person,
      firstname: 'Anna',
      stvId: '0012',
      divisionId: division.id,
      lineupId: division.lineup('boden'),
    });
    const berta = await createStarter(competition.id, { ...person, firstname: 'Berta' });
    await createStarter(competition.id, { ...person, firstname: 'Clara' });

    const { data, status } = await post(viewer.id, competition.id, [berta.id, anna.id]);
    expect(status).toBe(200);
    expect(data.headers.get('Content-Disposition')).toMatch(/attachment; filename=".+\.xlsx"/);
    const sheet = await read(data);
    const rows = sheet
      .getSheetValues()
      .slice(1)
      .map((row) => (row as unknown[]).slice(1));
    expect(rows[0]).toEqual([
      'STV-ID',
      'Vorname',
      'Nachname',
      'Geschlecht',
      'Jahrgang',
      'Verein',
      'Ort',
      'Kategorie',
      'Abteilung',
      'Startgerät',
    ]);
    expect(rows[1][1]).toBe('Berta');
    expect(rows[2]).toEqual([
      '0012',
      'Anna',
      'Muster',
      'Weiblich',
      2010,
      'TV Chur',
      'Chur',
      'K5',
      3,
      'Boden',
    ]);
    expect(rows).toHaveLength(3);
    // An export can be imported again.
    expect(parseSheet(rows as never)?.[1]).toMatchObject({
      stvId: '0012',
      firstname: 'Anna',
      sex: 'FEMALE',
      category: 'K5',
      divisionNumber: 3,
    });
  });

  it('writes values that look like formulas as text', async () => {
    const competition = await createCompetition();
    const names = ['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://x")'];
    const ids = [];
    for (const firstname of names)
      ids.push((await createStarter(competition.id, { firstname })).id);
    const { data } = await post(competition.ownerId, competition.id, ids);
    const sheet = await read(data);
    for (const [index, name] of names.entries()) {
      const cell = sheet.getCell(index + 2, 2);
      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(cell.value).toBe(name);
      // Stays text when the cell is edited.
      expect(cell.numFmt).toBe('@');
    }
  });

  it('leaves out starters of other competitions and removed ones', async () => {
    const competition = await createCompetition();
    const other = await createCompetition();
    const foreign = await createStarter(other.id);
    const removed = await createStarter(competition.id);
    await withdrawStarters(competition.id, [removed.id]);
    const { data } = await post(competition.ownerId, competition.id, [foreign.id, removed.id]);
    expect((await read(data)).rowCount).toBe(1);
  });

  it('exports everyone when opened as a link', async () => {
    const competition = await createCompetition();
    await createStarter(competition.id);
    await createStarter(competition.id);
    const { data } = await callRoute(loader, {
      layout: 'api',
      userId: competition.ownerId,
      competitionId: competition.id,
    });
    expect((await read(data)).rowCount).toBe(3);
  });

  it('is only for members', async () => {
    const competition = await createCompetition();
    const stranger = await createUser();
    for (const handler of [action, loader]) {
      const call = (userId: string | null) =>
        callRoute(handler, {
          layout: 'api',
          userId,
          competitionId: competition.id,
          body: handler === action ? new URLSearchParams() : undefined,
        });
      expect((await call(stranger.id)).status).toBe(404);
      expect((await call(null)).status).toBe(302);
    }
  });
});
