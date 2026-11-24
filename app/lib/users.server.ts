import { prisma } from './prisma.server';

/** Admins are owners of every competition. */
export async function isAdmin(userId: string) {
  return (await prisma.user.count({ where: { id: userId, isAdmin: true } })) > 0;
}
