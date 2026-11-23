import type { Athlete, Prisma } from '~/generated/prisma/client';
import type { Person, StarterData } from './domain/starter';
import { DomainError } from './errors';
import { prisma } from './prisma.server';

// Athletes are shared by all competitions. Callers that match or change them must hold
// lockAthletes, otherwise two requests could create the same person or STV-ID.

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_WORDS = 5;
const MAX_SUGGESTIONS = 10;

/**
 * Athletes of all competitions whose name or STV-ID contains every word. They include minors, so
 * only call this for signed-in users.
 */
export async function suggestAthletes(query: string) {
  const text = query.trim();
  if (text.length < MIN_QUERY_LENGTH) return [];

  const words = text.split(/\s+/).slice(0, MAX_QUERY_WORDS);
  const athletes = await prisma.athlete.findMany({
    where: {
      AND: words.map((word) => {
        const contains = { contains: word, mode: 'insensitive' } as const;
        return { OR: [{ firstname: contains }, { lastname: contains }, { stvId: contains }] };
      }),
    },
    include: {
      starters: { orderBy: { createdAt: 'desc' }, take: 1, select: { club: true } },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
    take: MAX_SUGGESTIONS,
  });
  return athletes.map(({ id, stvId, firstname, lastname, birthYear, sex, starters }) => ({
    athleteId: id,
    stvId,
    firstname,
    lastname,
    birthYear,
    sex,
    /** The club they last competed for. */
    club: starters[0]?.club ?? null,
  }));
}

/**
 * The athlete a new starter belongs to: the picked one, the owner of the STV-ID, the only one
 * with the same name, birth year and sex, or a new one. Existing athletes only get a missing
 * STV-ID, their other data stays as it is.
 */
export async function resolveAthlete(
  tx: Prisma.TransactionClient,
  competitionId: string,
  { athleteId, stvId, ...person }: StarterData & { athleteId?: string | null },
): Promise<Athlete> {
  const owner = stvId ? await tx.athlete.findUnique({ where: { stvId } }) : null;

  if (athleteId) {
    const athlete = await tx.athlete.findUnique({ where: { id: athleteId } });
    if (!athlete) throw new DomainError('NOT_FOUND');
    const belongsToOther = owner && owner.id !== athlete.id;
    if (belongsToOther || (stvId && athlete.stvId && athlete.stvId !== stvId)) {
      throw new DomainError('STV_ID_CONFLICT');
    }
    return addMissingStvId(tx, athlete, stvId);
  }

  if (owner) return owner;
  const match = await findByPerson(tx, competitionId, person, stvId);
  if (match) return addMissingStvId(tx, match, stvId);
  return tx.athlete.create({ data: { ...person, stvId } });
}

/**
 * The athlete of a starter after its STV-ID was edited. Starters of other competitions keep
 * theirs: an STV-ID that would change for them leads to another athlete instead.
 */
export async function changeStvId(
  tx: Prisma.TransactionClient,
  starter: Person & { id: string; athlete: Athlete },
  stvId: string | null,
): Promise<Athlete> {
  const { athlete } = starter;
  if (athlete.stvId === stvId) return athlete;

  const others = await tx.starter.count({
    where: { athleteId: athlete.id, id: { not: starter.id } },
  });
  const isShared = others > 0;
  if (stvId) {
    const owner = await tx.athlete.findUnique({ where: { stvId } });
    if (owner) return owner;
    if (athlete.stvId && isShared) {
      const { firstname, lastname, birthYear, sex } = starter;
      return tx.athlete.create({ data: { firstname, lastname, birthYear, sex, stvId } });
    }
  } else if (isShared) {
    return athlete;
  }
  return tx.athlete.update({ where: { id: athlete.id }, data: { stvId } });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function addMissingStvId(
  tx: Prisma.TransactionClient,
  athlete: Athlete,
  stvId: string | null,
) {
  if (athlete.stvId || !stvId) return athlete;
  return tx.athlete.update({ where: { id: athlete.id }, data: { stvId } });
}

async function findByPerson(
  tx: Prisma.TransactionClient,
  competitionId: string,
  { firstname, lastname, birthYear, sex }: Person,
  stvId: string | null,
) {
  // Prisma's insensitive mode treats "_" and "%" in names as wildcards.
  const matches = await tx.$queryRaw<(Athlete & { startsHere: boolean })[]>`
    SELECT athlete.*, EXISTS (
      SELECT 1 FROM starter
      WHERE starter."athleteId" = athlete.id AND starter."competitionId" = ${competitionId}
    ) AS "startsHere"
    FROM athlete
    WHERE lower(firstname) = lower(${firstname}) AND lower(lastname) = lower(${lastname})
      AND "birthYear" = ${birthYear} AND sex = ${sex}::"Sex"`;

  // Two different STV-IDs are two people.
  const candidates = matches.filter((match) => !match.stvId || !stvId || match.stvId === stvId);
  // Adding the same list again must find the starters of the first time.
  const here = candidates.filter(({ startsHere }) => startsHere);
  const [match, ...more] = here.length > 0 ? here : candidates;
  if (!match || more.length > 0) return null;
  return tx.athlete.findUniqueOrThrow({ where: { id: match.id } });
}
