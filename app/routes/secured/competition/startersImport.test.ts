import ExcelJS from 'exceljs';
import { beforeEach, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, readStarterFile } from '~/components/starters/importFile';
import { prisma } from '~/lib/prisma.server';
import {
  addMember,
  createClub,
  createCompetition,
  createDivision,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { callRoute } from '~/tests/starterRoutes';
import { action, loader } from './startersImport';

beforeEach(truncateTables);

async function setup() {
  const competition = await createCompetition();
  const club = await createClub();
  const call = (body: object, userId: string | null = competition.ownerId) =>
    callRoute(action, { layout: 'page', userId, competitionId: competition.id, body });
  return { competition, club, contestId: competition.contest.id, call };
}

const ANNA = {
  stvId: null,
  firstname: 'Anna',
  lastname: 'Muster',
  birthYear: 2010,
  sex: 'FEMALE',
  category: 'K5',
  divisionNumber: 1,
};

it('imports a workbook and reports the rows that fail', async () => {
  const { competition, club, contestId, call } = await setup();
  const division = await createDivision(contestId);
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Turnerinnen').addRows([
    ['Vorname', 'Nachname', 'Jahrgang', 'Geschlecht', 'Kategorie', 'Abteilung'],
    ['ANNA', 'muster', '10', 'w', 5, 'Abteilung 1'],
    ['Lea', 'Frei', 2011, 'f', 'K5', 9],
    ['', 'Ohne', 2011, 'f', 'K5', 1],
  ]);
  const bytes = await workbook.xlsx.writeBuffer();
  const result = await readStarterFile(new File([bytes as BlobPart], 'liste.xlsx'));
  if (!('starters' in result)) throw new Error(result.error);

  const { data } = await call({ contestId, clubId: club.id, rows: result.starters });
  expect(data).toMatchObject({
    created: 2,
    restored: 0,
    existing: 0,
    failures: [{ index: 2, message: 'Ungültige Eingabe.' }],
  });
  const entries = await prisma.entry.findMany({ include: { starter: true } });
  expect(entries.map((entry) => [entry.starter.firstname, entry.divisionId])).toEqual(
    expect.arrayContaining([
      ['Anna', division.id],
      ['Lea', null],
    ]),
  );
  expect(await prisma.starter.count({ where: { competitionId: competition.id } })).toBe(2);
});

it('reports rows without sex or birth year instead of guessing', async () => {
  const { club, contestId, call } = await setup();
  const { data } = await call({
    contestId,
    clubId: club.id,
    rows: [
      { ...ANNA, sex: null },
      { ...ANNA, birthYear: null },
      { ...ANNA, category: 'KH' },
    ],
  });
  expect(data.created).toBe(0);
  expect(data.failures.map(({ index }: { index: number }) => index)).toEqual([0, 1, 2]);
});

it('denies viewers, strangers and visitors', async () => {
  const { competition, club, contestId, call } = await setup();
  const viewer = await createUser();
  await addMember(competition.id, viewer.id, 'VIEWER');
  const stranger = await createUser();
  const body = { contestId, clubId: club.id, rows: [ANNA] };
  expect((await call(body, viewer.id)).status).toBe(403);
  expect((await call(body, stranger.id)).status).toBe(404);
  expect((await call(body, null)).status).toBe(302);

  const load = (userId: string | null) =>
    callRoute(loader, { layout: 'page', userId, competitionId: competition.id });
  expect((await load(viewer.id)).status).toBe(403);
  expect((await load(stranger.id)).status).toBe(404);
  expect((await load(null)).status).toBe(302);
  expect((await load(competition.ownerId)).status).toBe(200);
  expect(await prisma.starter.count()).toBe(0);
});

it('asks before it changes clubs', async () => {
  const { competition, club, contestId, call } = await setup();
  await call({ contestId, clubId: club.id, rows: [ANNA] });
  const starter = await prisma.starter.findFirstOrThrow();
  const other = await createClub();
  const body = { contestId, clubId: other.id, rows: [ANNA, { ...ANNA, firstname: 'Bea' }] };

  const { data } = await call(body);
  expect(data).toEqual({
    conflicts: [
      {
        starterId: starter.id,
        firstname: 'Anna',
        lastname: 'Muster',
        birthYear: 2010,
        club: { id: club.id, name: club.name, location: club.location },
      },
    ],
  });
  // Nothing is imported before the answer.
  expect(await prisma.starter.count({ where: { competitionId: competition.id } })).toBe(1);

  const viewer = await createUser();
  await addMember(competition.id, viewer.id, 'VIEWER');
  const answer = { ...body, changeClubOf: [starter.id] };
  expect((await call(answer, viewer.id)).status).toBe(403);
  expect((await call({ ...body, changeClubOf: ['\0'] })).status).toBe(400);

  const kept = await call({ ...body, changeClubOf: [] });
  expect(kept.data).toMatchObject({ created: 1, existing: 1, clubsKept: 1, clubsChanged: 0 });
  const find = () => prisma.starter.findUniqueOrThrow({ where: { id: starter.id } });
  expect(await find()).toMatchObject({ clubId: club.id });
  const changed = await call(answer);
  expect(changed.data).toMatchObject({ existing: 2, clubsKept: 0, clubsChanged: 1 });
  expect(await find()).toMatchObject({ clubId: other.id });
});

it('rejects contests of other competitions and unknown clubs', async () => {
  const { club, contestId, call } = await setup();
  const other = await createCompetition();
  const rows = [ANNA];
  expect((await call({ contestId: other.contest.id, clubId: club.id, rows })).status).toBe(404);
  expect((await call({ contestId, clubId: 'unknown', rows })).status).toBe(404);
});

it('limits the rows and their values', async () => {
  const { club, contestId, call } = await setup();
  const send = async (rows: object[]) => (await call({ contestId, clubId: club.id, rows })).status;
  expect(await send([])).toBe(400);
  expect(await send(Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ANNA))).toBe(400);
  expect(await send([{ ...ANNA, sex: 'X' }])).toBe(400);
  expect(await send([{ ...ANNA, lastname: 'a\0b' }])).toBe(400);
  expect(await send([{ ...ANNA, category: 'K\0' }])).toBe(400);
  expect(await send([{ ...ANNA, divisionNumber: 2 ** 40 }])).toBe(400);
  expect(await send([{ ...ANNA, firstname: 'x'.repeat(5000) }])).toBe(400);
});
