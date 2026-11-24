import { z } from 'zod';
import type { Prisma, Role } from '~/generated/prisma/client';
import { insertLogo } from './assets.server';
import { parseContestConfig } from './contests.server';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';
import { SEXES } from '~/modules/types';

const detailsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    location: z.string().trim().min(1).max(200),
    startDate: z.date(),
    endDate: z.date(),
    grounds: z.number().int().min(1).max(20),
    sexes: z.array(z.enum(SEXES)).min(1).optional(),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate);

export type CompetitionDetails = z.input<typeof detailsSchema>;
export type MemberInput = { email: string; role: Role };

const ROLE_LEVEL: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

// ── Competitions ─────────────────────────────────────────────────────────────

/** The competitions the user is a member of, newest first. */
/** The competitions of the user, with their role. */
export async function listCompetitions(userId: string) {
  const competitions = await prisma.competition.findMany({
    where: { members: { some: { userId } } },
    include: { members: { where: { userId }, select: { role: true } } },
    orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
  });
  return competitions.map(({ members: [{ role }], ...competition }) => ({ ...competition, role }));
}

/** The competition with the user's role. Strangers cannot tell whether it exists. */
export async function getCompetitionForUser(
  userId: string,
  competitionId: string,
  minRole: Role = 'VIEWER',
) {
  const member = await prisma.member.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    include: {
      competition: { include: { contests: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
    },
  });
  if (!member) throw new DomainError('NOT_FOUND');
  if (ROLE_LEVEL[member.role] < ROLE_LEVEL[minRole]) throw new DomainError('FORBIDDEN');
  return { ...member.competition, role: member.role };
}

export async function createCompetition(
  userId: string,
  input: CompetitionDetails & {
    contests: { module: string; name?: string; config?: unknown }[];
    members?: MemberInput[];
    logo?: Uint8Array<ArrayBuffer> | null;
  },
) {
  const details = parseDetails(input);
  if (input.contests.length === 0) throw new DomainError('INVALID_INPUT');
  const contests = input.contests.map(({ module, name, config }, position) => ({
    module,
    name: name?.trim() || module.toUpperCase(),
    position,
    config: parseContestConfig(module, config),
  }));

  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.create({
      data: {
        ...details,
        members: { create: { userId, role: 'OWNER' } },
        contests: { create: contests },
      },
    });
    for (const member of input.members ?? []) await insertMember(tx, competition.id, member);
    if (input.logo) await insertLogo(tx, competition.id, input.logo);
    return competition;
  });
}

export async function updateCompetition(competitionId: string, input: CompetitionDetails) {
  const details = parseDetails(input);
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const removedGround = { ground: { gt: details.grounds } };
    const divisions = await tx.division.count({
      where: { ...removedGround, contest: { competitionId } },
    });
    const displays = await tx.accessLink.count({
      where: { ...removedGround, competitionId, kind: 'DISPLAY' },
    });
    if (divisions + displays > 0) throw new DomainError('GROUND_IN_USE');
    if (details.sexes) {
      const sex = { notIn: details.sexes };
      const others =
        (await tx.starter.count({ where: { competitionId, deletedAt: null, sex } })) +
        (await tx.division.count({ where: { contest: { competitionId }, sex } }));
      if (others > 0) throw new DomainError('SEX_IN_USE');
    }

    // Judge links exist for every ground as soon as the page is opened, they cannot block this.
    await tx.accessLink.deleteMany({ where: { ...removedGround, competitionId } });
    await tx.competition.update({ where: { id: competitionId }, data: details });
  });
  publish(competitionId, 'settings');
}

export async function deleteCompetition(competitionId: string) {
  const { count } = await prisma.competition.deleteMany({ where: { id: competitionId } });
  if (count === 0) throw new DomainError('NOT_FOUND');
  publish(competitionId, 'settings');
}

export async function getStats(competitionId: string) {
  const active = { competitionId, deletedAt: null };
  const [starters, clubs, grades, states] = await Promise.all([
    prisma.starter.count({ where: active }),
    prisma.club.count({ where: { starters: { some: active } } }),
    prisma.grade.count({ where: { entry: { contest: { competitionId }, withdrawnAt: null } } }),
    prisma.division.groupBy({
      by: ['state'],
      where: { contest: { competitionId } },
      _count: { _all: true },
    }),
  ]);
  const divisions = { PENDING: 0, RUNNING: 0, ENDED: 0 };
  for (const { state, _count } of states) divisions[state] = _count._all;
  return { starters, clubs, grades, divisions };
}

// ── Members ──────────────────────────────────────────────────────────────────

export function listMembers(competitionId: string) {
  return prisma.member.findMany({
    where: { competitionId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { id: 'asc' },
  });
}

/** The addresses that have no account and have to be invited. */
export async function findUnknownEmails(emails: readonly string[]) {
  const normalized = emails.map(normalizeEmail);
  const users = await prisma.user.findMany({
    where: { email: { in: normalized } },
    select: { email: true },
  });
  const known = new Set(users.map(({ email }) => email));
  return normalized.filter((email) => !known.has(email));
}

export async function addMember(competitionId: string, input: MemberInput) {
  const member = await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    return insertMember(tx, competitionId, input);
  });
  publish(competitionId, 'settings');
  return member;
}

export async function changeMemberRole(competitionId: string, userId: string, role: Role) {
  await prisma.$transaction(async (tx) => {
    const member = await lockMember(tx, competitionId, userId);
    if (role !== 'OWNER') await assertNotLastOwner(tx, member);
    await tx.member.update({ where: { id: member.id }, data: { role } });
  });
  publish(competitionId, 'settings');
}

export async function removeMember(competitionId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const member = await lockMember(tx, competitionId, userId);
    await assertNotLastOwner(tx, member);
    await tx.member.delete({ where: { id: member.id } });
  });
  publish(competitionId, 'settings');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDetails(input: CompetitionDetails) {
  const result = detailsSchema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT');
  return result.data;
}

/** better-auth stores emails in lower case. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function insertMember(
  tx: Prisma.TransactionClient,
  competitionId: string,
  { email, role }: MemberInput,
) {
  const user = await tx.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) throw new DomainError('USER_NOT_FOUND');
  const existing = await tx.member.findUnique({
    where: { competitionId_userId: { competitionId, userId: user.id } },
  });
  if (existing) throw new DomainError('ALREADY_MEMBER');
  // Invited before they had the account.
  await tx.invitation.deleteMany({ where: { competitionId, email: user.email } });
  return tx.member.create({ data: { competitionId, userId: user.id, role } });
}

/** Locks the competition, so two owners leaving at the same time see each other. */
async function lockMember(tx: Prisma.TransactionClient, competitionId: string, userId: string) {
  await lockCompetition(tx, competitionId);
  const member = await tx.member.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
  });
  if (!member) throw new DomainError('NOT_FOUND');
  return member;
}

async function assertNotLastOwner(
  tx: Prisma.TransactionClient,
  member: { competitionId: string; userId: string; role: Role },
) {
  if (member.role !== 'OWNER') return;
  const others = await tx.member.count({
    where: {
      competitionId: member.competitionId,
      role: 'OWNER',
      userId: { not: member.userId },
    },
  });
  if (others === 0) throw new DomainError('LAST_OWNER');
}
