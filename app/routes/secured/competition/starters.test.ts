import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '~/lib/prisma.server';
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
import { action, loader } from './starters';

beforeEach(truncateTables);

async function setup() {
  const competition = await createCompetition();
  const club = await createClub({ name: 'TV Chur' });
  const viewer = await createUser();
  await addMember(competition.id, viewer.id, 'VIEWER');
  const call = (
    fields: Record<string, string | string[]>,
    userId: string | null = competition.ownerId,
  ) => {
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) {
      for (const item of [value].flat()) body.append(name, item);
    }
    return callRoute(action, { layout: 'page', userId, competitionId: competition.id, body });
  };
  const anna = {
    intent: 'create',
    contestId: competition.contest.id,
    stvId: '',
    firstname: 'Anna',
    lastname: 'Muster',
    birthYear: '2010',
    sex: 'FEMALE',
    clubId: club.id,
    category: 'K5',
    divisionId: '',
    startApparatus: '',
  };
  return { competition, club, viewer, call, anna };
}

const starters = () => prisma.starter.findMany({ include: { entries: true, athlete: true } });

describe('loader', () => {
  it('returns rows with the entry of the contest and the athlete they differ from', async () => {
    const { competition, viewer } = await setup();
    const division = await createDivision(competition.contest.id, { number: 2 });
    const starter = await createStarter(competition.id, {
      firstname: 'Anna',
      divisionId: division.id,
      startApparatus: 'boden',
    });
    await prisma.athlete.update({
      where: { id: starter.athleteId },
      data: { firstname: 'Anne', stvId: '7' },
    });

    const { data } = await callRoute(loader, {
      layout: 'page',
      userId: viewer.id,
      competitionId: competition.id,
    });
    expect(data.starters).toMatchObject([
      {
        id: starter.id,
        firstname: 'Anna',
        stvId: '7',
        entryId: starter.entry.id,
        category: 'K5',
        divisionId: division.id,
        divisionNumber: 2,
        startApparatus: 'boden',
        athlete: { firstname: 'Anne' },
        differs: true,
      },
    ]);
    expect(data.contest.categories.MALE).toContain('KH');
    expect(data.contest.divisions[0].apparatus).toHaveLength(4);
  });

  it('is only for members', async () => {
    const { competition } = await setup();
    const stranger = await createUser();
    const call = (userId: string | null) =>
      callRoute(loader, { layout: 'page', userId, competitionId: competition.id });
    expect((await call(stranger.id)).status).toBe(404);
    expect((await call(null)).status).toBe(302);
  });

  it('answers contests of other competitions with 404', async () => {
    const { competition } = await setup();
    const other = await createCompetition();
    const { status } = await callRoute(loader, {
      layout: 'page',
      userId: competition.ownerId,
      competitionId: competition.id,
      search: `?contest=${other.contest.id}`,
    });
    expect(status).toBe(404);
  });
});

describe('access', () => {
  it('denies viewers, strangers and visitors every intent', async () => {
    const { competition, viewer, call, anna } = await setup();
    const starter = await createStarter(competition.id);
    const stranger = await createUser();
    const intents: Record<string, string>[] = [
      anna,
      { ...anna, intent: 'update', starterId: starter.id },
      { intent: 'remove', id: starter.id },
      { intent: 'assign', assignments: '[]' },
    ];
    for (const fields of intents) {
      expect((await call(fields, viewer.id)).status).toBe(403);
      expect((await call(fields, stranger.id)).status).toBe(404);
      expect((await call(fields, null)).status).toBe(302);
    }
    expect(await starters()).toMatchObject([{ id: starter.id, deletedAt: null }]);
  });

  it('lets the check-in edit person and category, but not sex and assignment, and remove', async () => {
    const { competition, call, anna, club } = await setup();
    const checkIn = await createUser();
    await addMember(competition.id, checkIn.id, 'CHECK_IN');
    const division = await createDivision(competition.contest.id);
    const assigned = { category: 'K5', divisionId: division.id, startApparatus: 'boden' };
    const { id } = await createStarter(competition.id, { ...assigned });

    expect((await call({ intent: 'assign', assignments: '[]' }, checkIn.id)).status).toBe(403);

    const update = { ...anna, intent: 'update', starterId: id, sex: 'MALE' };
    const { data } = await call({ ...update, updateAthlete: 'on' }, checkIn.id);
    expect(data).toEqual({ ok: true });
    const [starter] = await starters();
    expect(starter).toMatchObject({
      firstname: 'Anna',
      clubId: club.id,
      sex: 'FEMALE',
      entries: [assigned],
    });
    expect(starter.athlete.firstname).not.toBe('Anna');

    // The division is of the old category. Another one cannot be sent along.
    const k6 = await createDivision(competition.contest.id, { category: 'K6' });
    const move = { ...update, category: 'K6', divisionId: k6.id, startApparatus: 'reck' };
    expect((await call(move, checkIn.id)).data).toEqual({ ok: true });
    expect((await starters())[0].entries).toMatchObject([
      { category: 'K6', divisionId: null, startApparatus: null },
    ]);

    expect((await call({ intent: 'remove', id }, checkIn.id)).data).toEqual({ ok: true });
    expect((await starters())[0].deletedAt).not.toBeNull();
  });

  it('lets the check-in add people with a category, but without a division', async () => {
    const { competition, call, anna } = await setup();
    const checkIn = await createUser();
    await addMember(competition.id, checkIn.id, 'CHECK_IN');
    const division = await createDivision(competition.contest.id);
    const { data } = await call({ ...anna, divisionId: division.id }, checkIn.id);
    expect(data).toEqual({ ok: true });
    expect(await starters()).toMatchObject([
      { firstname: 'Anna', entries: [{ category: 'K5', divisionId: null }] },
    ]);
  });

  it('does not touch starters of other competitions', async () => {
    const { call, anna } = await setup();
    const other = await createCompetition();
    const foreign = await createStarter(other.id);
    const division = await createDivision(other.contest.id);

    const results = await Promise.all([
      call({ ...anna, intent: 'update', starterId: foreign.id }),
      call({ intent: 'remove', id: foreign.id }),
      call({ ...anna, contestId: other.contest.id }),
      call({
        intent: 'assign',
        assignments: JSON.stringify([
          { entryIds: [foreign.entry.id], divisionId: division.id, startApparatus: null },
        ]),
      }),
    ]);
    expect(results.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
    expect(await starters()).toMatchObject([{ id: foreign.id, deletedAt: null }]);
  });

  it('answers NUL characters with 400', async () => {
    const { competition, call, anna } = await setup();
    const { id } = await createStarter(competition.id);
    const all: Record<string, string>[] = [
      { ...anna, firstname: 'a\0b' },
      { ...anna, clubId: '\0' },
      { ...anna, intent: 'update', starterId: id, contestId: '\0' },
      { intent: 'remove', id: '\0' },
      {
        intent: 'assign',
        assignments: JSON.stringify([{ entryIds: ['\0'], divisionId: 'x' }]),
      },
    ];
    for (const fields of all) expect((await call(fields)).status).toBe(400);
  });

  it('answers unknown intents with 400', async () => {
    const { call } = await setup();
    expect((await call({ intent: 'other' })).status).toBe(400);
  });
});

describe('create', () => {
  it('adds a starter with its entry, without an STV-ID', async () => {
    const { call, anna, club, competition } = await setup();
    const division = await createDivision(competition.contest.id);
    const { data, toasts } = await call({ ...anna, divisionId: division.id });
    expect(data).toEqual({ ok: true });
    expect(toasts).toMatchObject([{ type: 'success' }]);
    expect(await starters()).toMatchObject([
      {
        firstname: 'Anna',
        clubId: club.id,
        athlete: { stvId: null },
        entries: [{ category: 'K5', divisionId: division.id }],
      },
    ]);
  });

  it('reports missing and invalid fields', async () => {
    const { call, anna } = await setup();
    const { status, data } = await call({
      ...anna,
      firstname: ' ',
      birthYear: '10',
      sex: '',
      clubId: '',
    });
    expect(status).toBe(400);
    expect(data.errors).toEqual({
      firstname: 'Bitte ausfüllen',
      birthYear: 'Ungültiger Wert',
      sex: 'Bitte ausfüllen',
      clubId: 'Bitte ausfüllen',
    });
  });

  it('restores a removed starter and keeps the category', async () => {
    const { call, anna } = await setup();
    await call(anna);
    const [{ id }] = await starters();
    await call({ intent: 'remove', id });
    const { toasts } = await call({ ...anna, category: '' });
    expect(toasts[0].message).toContain('wieder');
    expect(await starters()).toMatchObject([
      { id, deletedAt: null, entries: [{ category: 'K5', withdrawnAt: null }] },
    ]);
  });

  it('tells when the person already starts', async () => {
    const { call, anna } = await setup();
    await call(anna);
    const { toasts } = await call({ ...anna, firstname: 'ANNA' });
    expect(toasts).toMatchObject([{ type: 'info' }]);
    expect(await starters()).toHaveLength(1);
  });

  it('reports a conflicting STV-ID', async () => {
    const { call, anna, competition } = await setup();
    const other = await createStarter(competition.id, { stvId: '1' });
    const { status, data } = await call({ ...anna, athleteId: other.athleteId, stvId: '2' });
    expect(status).toBe(400);
    expect(data.errors.stvId).toMatch(/jemand anderem/);
    const typo = await call({ ...anna, firstname: 'Beat', stvId: '1' });
    expect(typo.data.errors.stvId).toMatch(/jemand anderem/);
  });

  it('tells when an STV-ID belongs to a removed or another starter', async () => {
    const { call, anna, competition } = await setup();
    const owner = await createStarter(competition.id, {
      firstname: 'Anna',
      lastname: 'Muster',
      birthYear: 2010,
      stvId: '1',
    });
    const other = await createStarter(competition.id);
    const update = { ...anna, intent: 'update', starterId: other.id, stvId: '1' };
    expect((await call(update)).data.errors.stvId).toMatch(/nimmt bereits teil/);
    await call({ intent: 'remove', id: owner.id });
    expect((await call(update)).data.errors.stvId).toMatch(/entfernt/);
  });
});

describe('update', () => {
  it('leaves the athlete alone unless asked', async () => {
    const { call, anna } = await setup();
    await call(anna);
    const [{ id }] = await starters();
    const update = { ...anna, intent: 'update', starterId: id, firstname: 'Anne' };

    await call(update);
    expect(await starters()).toMatchObject([{ firstname: 'Anne', athlete: { firstname: 'Anna' } }]);
    await call({ ...update, updateAthlete: 'on' });
    expect(await starters()).toMatchObject([{ firstname: 'Anne', athlete: { firstname: 'Anne' } }]);
  });

  it('changes and clears category, division and start apparatus', async () => {
    const { call, anna, competition } = await setup();
    const division = await createDivision(competition.contest.id);
    await call(anna);
    const [{ id }] = await starters();
    const update = { ...anna, intent: 'update', starterId: id };

    await call({ ...update, divisionId: division.id, startApparatus: 'reck' });
    expect((await starters())[0].entries[0]).toMatchObject({
      divisionId: division.id,
      startApparatus: 'reck',
    });
    await call({ ...update, category: '' });
    expect((await starters())[0].entries[0]).toMatchObject({
      category: null,
      divisionId: null,
      startApparatus: null,
    });
  });

  it('does not add an entry to a contest the starter is not part of', async () => {
    const { call, anna, competition } = await setup();
    const starter = await createStarter(competition.id);
    await prisma.entry.deleteMany();
    const { data } = await call({ ...anna, intent: 'update', starterId: starter.id, category: '' });
    expect(data).toEqual({ ok: true });
    expect((await starters())[0].entries).toEqual([]);
  });
});

describe('assign and remove', () => {
  it('assigns several groups at once', async () => {
    const { call, competition } = await setup();
    const k5 = await createDivision(competition.contest.id);
    const k6 = await createDivision(competition.contest.id, { category: 'K6' });
    const a = await createStarter(competition.id);
    const b = await createStarter(competition.id, { category: 'K6' });
    const { data } = await call({
      intent: 'assign',
      assignments: JSON.stringify([
        { entryIds: [a.entry.id], divisionId: k5.id, startApparatus: 'reck' },
        { entryIds: [b.entry.id], divisionId: k6.id, startApparatus: null },
      ]),
    });
    expect(data).toEqual({ ok: true });
    const entries = await prisma.entry.findMany({ orderBy: { category: 'asc' } });
    expect(entries).toMatchObject([
      { divisionId: k5.id, startApparatus: 'reck' },
      { divisionId: k6.id, startApparatus: null },
    ]);
  });

  it('keeps the lineup when none is sent', async () => {
    const { call, competition } = await setup();
    const division = await createDivision(competition.contest.id);
    const startApparatus = 'boden';
    const { entry } = await createStarter(competition.id, {
      divisionId: division.id,
      startApparatus,
    });
    const { status } = await call({
      intent: 'assign',
      assignments: JSON.stringify([{ entryIds: [entry.id], divisionId: division.id }]),
    });
    expect(status).toBe(200);
    expect(await prisma.entry.findFirst()).toMatchObject({ startApparatus });
  });

  it.each(['', 'nonsense', '[{}]', '{}'])('rejects assignments %j', async (assignments) => {
    const { call } = await setup();
    expect((await call({ intent: 'assign', assignments })).status).toBe(400);
  });

  it('reports divisions that do not fit', async () => {
    const { call, competition } = await setup();
    const k6 = await createDivision(competition.contest.id, { category: 'K6' });
    const starter = await createStarter(competition.id);
    const { status, data } = await call({
      intent: 'assign',
      assignments: JSON.stringify([
        { entryIds: [starter.entry.id], divisionId: k6.id, startApparatus: null },
      ]),
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/Abteilung/);
  });

  it('removes several starters', async () => {
    const { call, competition } = await setup();
    const a = await createStarter(competition.id);
    const b = await createStarter(competition.id);
    expect((await call({ intent: 'remove', id: [a.id, b.id] })).data).toEqual({ ok: true });
    expect(await prisma.starter.count({ where: { deletedAt: null } })).toBe(0);
    expect((await call({ intent: 'remove' })).status).toBe(400);
  });
});
