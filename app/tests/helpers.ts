import { randomUUID } from 'node:crypto';
import type { Role, Sex } from '~/generated/prisma/client';
import { prisma } from '~/lib/prisma.server';
import { egtModule } from '~/modules/egt/module';
import { getContestModule } from '~/modules/registry';
import { assertTestDatabase } from './database';

let counter = 0;

export async function truncateTables() {
  const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  assertTestDatabase(name);

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

export function createUser(data: { email?: string; name?: string } = {}) {
  const id = randomUUID();
  return prisma.user.create({
    data: { id, name: data.name ?? 'Test', email: data.email ?? `${id}@example.com` },
  });
}

export async function createCompetition(
  data: { ownerId?: string; grounds?: number; name?: string } = {},
) {
  const ownerId = data.ownerId ?? (await createUser()).id;
  const competition = await prisma.competition.create({
    data: {
      name: data.name ?? 'Gerätecup',
      location: 'Zürich',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-02'),
      grounds: data.grounds ?? 1,
      members: { create: { userId: ownerId, role: 'OWNER' } },
      contests: {
        create: { module: 'egt', name: 'EGT', config: egtModule.defaultConfig },
      },
    },
    include: { contests: true },
  });
  return { ...competition, ownerId, contest: competition.contests[0] };
}

export function addMember(competitionId: string, userId: string, role: Role) {
  return prisma.member.create({ data: { competitionId, userId, role } });
}

export function createClub(data: { name?: string; location?: string } = {}) {
  return prisma.club.create({
    data: { name: data.name ?? `TV ${++counter}`, location: data.location ?? 'Zürich' },
  });
}

export async function createDivision(
  contestId: string,
  data: {
    category?: string;
    sex?: Sex;
    number?: number;
    ground?: number;
    state?: 'PENDING' | 'RUNNING' | 'ENDED';
  } = {},
) {
  const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId } });
  const sex = data.sex ?? 'FEMALE';
  const state = data.state ?? 'PENDING';
  const apparatus = getContestModule(contest).apparatus(sex);
  return prisma.division.create({
    data: {
      contestId,
      category: data.category ?? 'K5',
      sex,
      number: data.number ?? 1,
      ground: data.ground ?? 1,
      state,
      startedAt: state === 'PENDING' ? null : new Date(Date.now() - 60_000),
      endedAt: state === 'ENDED' ? new Date() : null,
      apparatus: {
        create: apparatus.map((key) => ({
          apparatus: key,
          completedRounds: state === 'ENDED' ? apparatus.length : 0,
        })),
      },
    },
  });
}

/** A starter with an entry in the competition's first contest. */
export async function createStarter(
  competitionId: string,
  data: {
    athleteId?: string;
    stvId?: string | null;
    firstname?: string;
    lastname?: string;
    birthYear?: number;
    sex?: Sex;
    clubId?: string;
    category?: string | null;
    divisionId?: string;
    startApparatus?: string;
    position?: number;
    withdrawnAt?: Date;
    grades?: Record<string, number>;
  } = {},
) {
  const clubId = data.clubId ?? (await createClub()).id;
  const contest = await prisma.contest.findFirstOrThrow({
    where: { competitionId },
    orderBy: { position: 'asc' },
  });
  const person = {
    firstname: data.firstname ?? `First${++counter}`,
    lastname: data.lastname ?? `Last${counter}`,
    birthYear: data.birthYear ?? 2010,
    sex: data.sex ?? 'FEMALE',
  };
  const athleteId =
    data.athleteId ??
    (await prisma.athlete.create({ data: { ...person, stvId: data.stvId ?? null } })).id;
  const starter = await prisma.starter.create({
    data: {
      competitionId,
      athleteId,
      ...person,
      clubId,
      entries: {
        create: {
          contestId: contest.id,
          category: data.category === undefined ? 'K5' : data.category,
          divisionId: data.divisionId,
          startApparatus: data.startApparatus,
          position: data.position ?? ++counter,
          withdrawnAt: data.withdrawnAt,
          grades: {
            create: Object.entries(data.grades ?? {}).map(([apparatus, value]) => ({
              apparatus,
              value,
              attempts: [],
            })),
          },
        },
      },
    },
    include: { entries: true },
  });
  return { ...starter, entry: starter.entries[0] };
}

/** The code of the DomainError that `action` fails with. */
export async function errorCode(action: Promise<unknown>) {
  try {
    await action;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  return null;
}
