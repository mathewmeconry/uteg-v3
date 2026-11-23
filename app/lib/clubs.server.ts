import { z } from 'zod';
import type { Club } from '~/generated/prisma/client';
import { DomainError } from './errors';
import { prisma } from './prisma.server';

const clubSchema = z.object({
  name: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
});

/** Clubs are shared by all competitions. */
export function listClubs(query?: string) {
  const contains = { contains: query?.trim() ?? '', mode: 'insensitive' } as const;
  return prisma.club.findMany({
    where: { OR: [{ name: contains }, { location: contains }] },
    orderBy: [{ name: 'asc' }, { location: 'asc' }],
  });
}

/** Returns the existing club when it only differs in upper and lower case. */
export async function createClub(input: z.input<typeof clubSchema>) {
  const result = clubSchema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT');

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('club'))`;
    const { name, location } = result.data;
    const [existing] = await tx.$queryRaw<Club[]>`
      SELECT * FROM club
      WHERE lower(name) = lower(${name}) AND lower(location) = lower(${location})
      LIMIT 1`;
    return existing ?? tx.club.create({ data: result.data });
  });
}
