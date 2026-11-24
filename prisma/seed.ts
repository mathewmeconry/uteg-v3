import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { Sex } from '~/generated/prisma/client';
import { createClub } from '~/lib/clubs.server';
import { createCompetition, deleteCompetition } from '~/lib/competitions.server';
import { createDivision, startDivisions } from '~/lib/divisions.server';
import { confirmRound, getJudgingState, saveGrades } from '~/lib/judging.server';
import { prisma } from '~/lib/prisma.server';
import { assignEntries, importStarters } from '~/lib/starters.server';
import { getContestModule } from '~/modules/registry';

const EMAIL = 'demo@uteg.local';
const COMPETITION = 'Demo Gerätecup';

const CLUBS = [
  ['TV Altstetten', 'Zürich'],
  ['Geräteriege Buchs', 'Buchs'],
  ['TV Chur', 'Chur'],
  ['STV Dübendorf', 'Dübendorf'],
  ['TV Eschenbach', 'Eschenbach'],
  ['Getu Frauenfeld', 'Frauenfeld'],
  ['TV Gossau', 'Gossau'],
  ['STV Hinwil', 'Hinwil'],
];

const FIRSTNAMES: Record<Sex, string[]> = {
  FEMALE: ['Anna', 'Lea', 'Mia', 'Nina', 'Sara', 'Elin', 'Julia', 'Lara', 'Noemi', 'Zoé'],
  MALE: ['Luca', 'Noah', 'Jan', 'Tim', 'Nico', 'Elias', 'Leon', 'Fabio'],
};

const LASTNAMES = ['Ammann', 'Brunner', 'Caduff', 'Dubach', 'Egli', 'Frei', 'Gerber', 'Huber'];

type State = 'PENDING' | 'RUNNING' | 'ENDED';
type Group = { category: string; sex: Sex; ground: number; size: number; state: State };

const GROUPS: Group[] = [
  { category: 'K3', sex: 'FEMALE', ground: 1, size: 12, state: 'ENDED' },
  { category: 'K5', sex: 'FEMALE', ground: 1, size: 12, state: 'ENDED' },
  { category: 'K5', sex: 'MALE', ground: 2, size: 10, state: 'ENDED' },
  { category: 'K5', sex: 'FEMALE', ground: 1, size: 12, state: 'RUNNING' },
  { category: 'K6', sex: 'MALE', ground: 2, size: 10, state: 'RUNNING' },
  { category: 'K6', sex: 'FEMALE', ground: 1, size: 12, state: 'PENDING' },
  { category: 'KH', sex: 'MALE', ground: 2, size: 12, state: 'PENDING' },
];

const random = createRandom(2026);

async function main() {
  const userId = await upsertUser();
  const old = await prisma.competition.findMany({
    where: { name: COMPETITION, members: { some: { userId, role: 'OWNER' } } },
  });
  for (const { id } of old) await deleteCompetition(id);

  const competition = await createCompetition(userId, {
    name: COMPETITION,
    location: 'Zürich',
    startDate: new Date('2026-05-09'),
    endDate: new Date('2026-05-10'),
    grounds: 2,
    contests: [{ module: 'egt', name: 'EGT' }],
  });
  const contest = await prisma.contest.findFirstOrThrow({
    where: { competitionId: competition.id },
  });
  const clubs = [];
  for (const [name, location] of CLUBS) clubs.push(await createClub({ name, location }));
  const people = { FEMALE: createPeople('FEMALE'), MALE: createPeople('MALE') };

  for (const { size, state, ...data } of GROUPS) {
    const division = await createDivision(competition.id, contest.id, data);
    const members = people[data.sex].splice(0, size);
    for (const [index, club] of clubs.entries()) {
      const { failures } = await importStarters(competition.id, {
        contestId: contest.id,
        clubId: club.id,
        rows: members
          .filter((_, position) => position % clubs.length === index)
          .map((person) => ({
            ...person,
            category: data.category,
            divisionNumber: division.number,
          })),
      });
      if (failures.length > 0) throw new Error(`Import failed: ${JSON.stringify(failures)}`);
    }
    const entries = await prisma.entry.findMany({
      where: { divisionId: division.id },
      orderBy: [{ starter: { lastname: 'asc' } }, { starter: { firstname: 'asc' } }],
    });
    const apparatus = getContestModule(contest).apparatus(data.sex);
    await assignEntries(
      competition.id,
      apparatus.map((startApparatus, index) => ({
        divisionId: division.id,
        startApparatus,
        entryIds: entries
          .filter((_, position) => position % apparatus.length === index)
          .map(({ id }) => id),
      })),
    );
    if (state === 'PENDING') continue;
    await startDivisions(competition.id, [division.id]);
    await judge(competition.id, data.ground, state === 'ENDED' ? Infinity : 1);
  }

  const starters = await prisma.starter.count({ where: { competitionId: competition.id } });
  print(`Created "${COMPETITION}" with ${starters} starters. Sign in as ${EMAIL}.`);
}

async function upsertUser() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  const password = process.env.SEED_PASSWORD || (existing ? null : createPassword());
  const user =
    existing ??
    (await prisma.user.create({
      data: { id: randomUUID(), name: 'Demo', email: EMAIL, emailVerified: true },
    }));
  if (!password) return user.id;

  const credential = { userId: user.id, providerId: 'credential' };
  await prisma.account.deleteMany({ where: credential });
  await prisma.account.create({
    data: {
      ...credential,
      id: randomUUID(),
      accountId: user.id,
      password: await hashPassword(password),
    },
  });
  if (!process.env.SEED_PASSWORD) print(`Password (shown only now): ${password}`);
  return user.id;
}

/** Grades and confirms the next rounds on a ground the way the tablets do. */
async function judge(competitionId: string, ground: number, rounds: number) {
  for (let step = 0; step < rounds; step++) {
    const { divisions, apparatus } = await getJudgingState(competitionId, ground);
    if (divisions.length === 0) return;
    for (const { apparatus: key, currentRound, divisionIds, rounds: lists } of apparatus) {
      if (currentRound === null) continue;
      await saveGrades(
        competitionId,
        lists[currentRound].slots.map(({ entryId, inputRule }) => ({
          entryId,
          apparatus: key,
          ...(inputRule.attempts > 1
            ? { attempts: Array.from({ length: inputRule.attempts }, createGrade) }
            : { value: createGrade() }),
        })),
        { kind: 'judge', ground, apparatus: key },
      );
      await confirmRound(competitionId, {
        ground,
        apparatus: key,
        round: currentRound,
        divisionIds,
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createPeople(sex: Sex) {
  return LASTNAMES.flatMap((lastname) =>
    FIRSTNAMES[sex].map((firstname) => ({
      firstname,
      lastname,
      sex,
      birthYear: 2006 + Math.floor(random() * 10),
    })),
  )
    .map((person) => ({ person, order: random() }))
    .toSorted((a, b) => a.order - b.order)
    .map(({ person }) => person);
}

/** 8.00 to 9.95 in steps of 0.05, as thousandths. */
function createGrade() {
  return 8000 + Math.floor(random() * 40) * 50;
}

function createPassword() {
  return randomBytes(12).toString('base64url');
}

/** Every run creates the same data. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

function print(text: string) {
  process.stdout.write(`${text}\n`);
}

await main().finally(() => prisma.$disconnect());
