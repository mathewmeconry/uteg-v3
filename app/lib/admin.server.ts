import { Role } from '~/generated/prisma/client';
import { getTiming } from './domain/competitionPhase';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

export async function getAdminStats() {
  const [users, unverified, competitions, starters, grades] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: false } }),
    prisma.competition.count(),
    prisma.starter.count({ where: { deletedAt: null } }),
    prisma.grade.count({ where: { entry: { withdrawnAt: null } } }),
  ]);
  return { users, unverified, competitions, starters, grades };
}

/** All users, the newest first. */
export async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      emailVerified: true,
      isAdmin: true,
      createdAt: true,
      memberships: {
        select: { role: true, competition: { select: { id: true, name: true } } },
        orderBy: { competition: { startDate: 'desc' } },
      },
      // Sessions are refreshed once a day, so this is about when they last used the app.
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return users.map(({ sessions: [session], ...user }) => ({
    ...user,
    /** null without a session. */
    lastActive: session?.updatedAt ?? null,
  }));
}

/** All competitions, the newest first. */
export async function listAllCompetitions() {
  const now = new Date();
  const competitions = await prisma.competition.findMany({
    select: {
      id: true,
      name: true,
      location: true,
      startDate: true,
      endDate: true,
      members: {
        where: { role: Role.OWNER },
        select: { user: { select: { email: true } } },
        orderBy: { id: 'asc' },
      },
      _count: { select: { starters: { where: { deletedAt: null } } } },
    },
    orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
  });
  return competitions.map(({ members, _count, ...competition }) => ({
    ...competition,
    isToday: getTiming(competition, now) === 'today',
    owners: members.map(({ user }) => user.email),
    starters: _count.starters,
  }));
}

/** The address of a user. */
export async function getUserEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new DomainError('NOT_FOUND');
  return user.email;
}

/** Signs the user out on all devices. */
export async function endSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Admins cannot be deleted, they are only made and unmade in the database. */
export async function deleteUser(userId: string) {
  const competitionIds = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        isAdmin: true,
        memberships: { select: { competitionId: true }, orderBy: { competitionId: 'asc' } },
      },
    });
    if (!user) throw new DomainError('NOT_FOUND');
    if (user.isAdmin) throw new DomainError('FORBIDDEN');

    const ids = user.memberships.map(({ competitionId }) => competitionId);
    // So another owner cannot leave at the same time.
    for (const id of ids) await lockCompetition(tx, id);
    const ownedAlone = await tx.competition.count({
      where: {
        members: { some: { userId, role: Role.OWNER } },
        NOT: { members: { some: { userId: { not: userId }, role: Role.OWNER } } },
      },
    });
    if (ownedAlone > 0) throw new DomainError('USER_IS_LAST_OWNER');

    await tx.user.delete({ where: { id: userId } });
    return ids;
  });
  for (const id of competitionIds) publish(id, 'settings');
}
