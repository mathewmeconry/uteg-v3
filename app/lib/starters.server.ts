import { z } from 'zod';
import type { Prisma, Sex } from '~/generated/prisma/client';
import { changeStvId, matchAthlete, resolveAthlete } from './athletes.server';
import { getContest } from './contests.server';
import {
  isSamePerson,
  starterSchema,
  starterUpdateSchema,
  type StarterInput,
} from './domain/starter';
import { DomainError, type DomainErrorCode } from './errors';
import { publish } from './events.server';
import { nextPosition } from './lineups.server';
import { lockAthletes, lockCompetition, lockDivisions } from './locks.server';
import { prisma } from './prisma.server';

/** Changes of an entry. Undefined keeps the value as far as it still fits, null clears it. */
export type EntryPatch = {
  contestId: string;
  category?: string | null;
  divisionId?: string | null;
  lineupId?: string | null;
};

export type NewStarter = StarterInput & {
  clubId: string;
  /** The athlete picked from the suggestions. */
  athleteId?: string | null;
  entries?: EntryPatch[];
};

export type StarterUpdate = Partial<StarterInput> & {
  clubId?: string;
  entries?: EntryPatch[];
  /** Also write names, birth year and sex to the athlete. Other competitions keep theirs. */
  updateAthlete?: boolean;
};

export type ImportRow = Partial<StarterInput> & {
  athleteId?: string | null;
  category?: string | null;
  divisionNumber?: number | null;
};

type Outcome = 'created' | 'restored' | 'existing';

const IMPORT_TIMEOUT_MS = 120_000;

// ── Reading ──────────────────────────────────────────────────────────────────

const STARTER_INCLUDE = {
  club: true,
  athlete: true,
  entries: { include: { division: true, lineup: true } },
} satisfies Prisma.StarterInclude;

export async function listStarters(competitionId: string) {
  const starters = await prisma.starter.findMany({
    where: { competitionId, deletedAt: null },
    include: STARTER_INCLUDE,
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
  });
  return starters.map(toResult);
}

export async function getStarter(competitionId: string, starterId: string) {
  const starter = await prisma.starter.findFirst({
    where: { id: starterId, competitionId, deletedAt: null },
    include: STARTER_INCLUDE,
  });
  if (!starter) throw new DomainError('NOT_FOUND');
  return toResult(starter);
}

// ── Adding ───────────────────────────────────────────────────────────────────

/**
 * Adds a starter. Someone who already starts here is reused: an active starter only gets the club
 * and the given entries, a removed one is restored with the new values.
 */
export async function createStarter(competitionId: string, input: NewStarter) {
  const result = await prisma.$transaction(async (tx) => {
    await lockAll(tx, competitionId);
    const { starterId, outcome } = await addStarter(tx, competitionId, input, () => true);
    return { starterId, outcome };
  });
  publish(competitionId, 'starters');
  return result;
}

/**
 * The starters that take part with another club and match a row. Their club only changes when
 * importStarters is told to. Changes nothing.
 */
export async function findClubConflicts(
  competitionId: string,
  { clubId, rows }: { clubId: string; rows: readonly ImportRow[] },
) {
  await assertClub(prisma, clubId);
  const athleteIds = new Set<string>();
  for (const { category: _, divisionNumber: __, ...row } of rows) {
    try {
      const { athleteId, ...input } = row;
      const athlete = await matchAthlete(prisma, competitionId, {
        ...parse(starterSchema, input),
        athleteId,
      });
      if (athlete) athleteIds.add(athlete.id);
    } catch (error) {
      // The import reports these rows.
      if (!(error instanceof DomainError)) throw error;
    }
  }
  const starters = await prisma.starter.findMany({
    where: {
      competitionId,
      athleteId: { in: [...athleteIds] },
      deletedAt: null,
      clubId: { not: clubId },
    },
    include: { club: true },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
  });
  return starters.map(({ id, firstname, lastname, birthYear, club }) => ({
    starterId: id,
    firstname,
    lastname,
    birthYear,
    club: { name: club.name, location: club.location },
  }));
}

/**
 * Adds the rows that are valid and reports the others by their index. Starters that already take
 * part keep their club, except for those in `overwriteClubOf`.
 */
export async function importStarters(
  competitionId: string,
  {
    contestId,
    clubId,
    rows,
    overwriteClubOf = [],
  }: {
    contestId: string;
    clubId: string;
    rows: readonly ImportRow[];
    overwriteClubOf?: readonly string[];
  },
) {
  const overwrite = new Set(overwriteClubOf);
  const clubs = { changed: new Set<string>(), kept: new Set<string>() };
  const result = await prisma.$transaction(
    async (tx) => {
      await lockAll(tx, competitionId);
      await getContest(competitionId, contestId, tx);
      await assertClub(tx, clubId);

      const counts: Record<Outcome, number> = { created: 0, restored: 0, existing: 0 };
      const failures: { index: number; code: DomainErrorCode }[] = [];
      for (const [index, { category, divisionNumber, ...row }] of rows.entries()) {
        // A failing row must not undo the others, nor leave a part of itself.
        await tx.$executeRaw`SAVEPOINT import_row`;
        try {
          const divisionId = await findDivisionId(tx, {
            contestId,
            category,
            sex: row.sex,
            number: divisionNumber,
          });
          const { outcome, starterId, clubChange } = await addStarter(
            tx,
            competitionId,
            {
              ...row,
              clubId,
              entries: [{ contestId, category: category || undefined, divisionId }],
            } as NewStarter,
            (id) => overwrite.has(id),
          );
          counts[outcome]++;
          if (clubChange) clubs[clubChange].add(starterId);
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT import_row`;
          failures.push({ index, code: error.code });
        }
        await tx.$executeRaw`RELEASE SAVEPOINT import_row`;
      }
      return {
        ...counts,
        clubsChanged: clubs.changed.size,
        clubsKept: clubs.kept.size,
        failures,
      };
    },
    { timeout: IMPORT_TIMEOUT_MS },
  );
  publish(competitionId, 'starters');
  return result;
}

// ── Changing ─────────────────────────────────────────────────────────────────

export async function updateStarter(
  competitionId: string,
  starterId: string,
  { clubId, entries = [], updateAthlete = false, ...input }: StarterUpdate,
) {
  const { stvId, ...person } = parse(starterUpdateSchema, input);

  await prisma.$transaction(async (tx) => {
    await lockAll(tx, competitionId);
    const before = await tx.starter.findFirst({
      where: { id: starterId, competitionId, deletedAt: null },
      include: { athlete: true, entries: true },
    });
    if (!before) throw new DomainError('NOT_FOUND');
    if (clubId !== undefined) await assertClub(tx, clubId);

    const after = { ...before, ...withoutUndefined(person) };
    const athlete = stvId === undefined ? before.athlete : await changeStvId(tx, after, stvId);
    if (athlete.id !== before.athleteId) await assertNotStarting(tx, competitionId, athlete.id);

    await tx.starter.update({
      where: { id: starterId },
      data: { ...person, clubId, athleteId: athlete.id },
    });
    if (updateAthlete) {
      const { firstname, lastname, birthYear, sex } = after;
      await tx.athlete.update({
        where: { id: athlete.id },
        data: { firstname, lastname, birthYear, sex },
      });
    }

    const patched = new Set(entries.map(({ contestId }) => contestId));
    const others = before.entries.filter(({ contestId }) => !patched.has(contestId));
    // Entries without changes may not fit the new sex any more.
    for (const patch of [...entries, ...others.map(({ contestId }) => ({ contestId }))]) {
      await saveEntry(tx, competitionId, { starterId, sex: after.sex }, patch);
    }
  });
  publish(competitionId, 'starters');
}

/** Removes starters. Their entries keep slot and grades, see isVisible in domain/rotation. */
export async function withdrawStarters(competitionId: string, starterIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const where = { id: { in: starterIds }, competitionId };
    const count = await tx.starter.count({ where });
    if (count !== new Set(starterIds).size) throw new DomainError('NOT_FOUND');

    const now = new Date();
    await tx.starter.updateMany({ where: { ...where, deletedAt: null }, data: { deletedAt: now } });
    await tx.entry.updateMany({
      where: { starterId: { in: starterIds }, withdrawnAt: null },
      data: { withdrawnAt: now },
    });
  });
  publish(competitionId, 'starters');
}

export type Assignment = { entryIds: string[]; divisionId: string; lineupId?: string | null };

/**
 * Puts groups of entries into a division, and at the end of a lineup if given. Without a lineup they
 * keep theirs as far as it belongs to the division, null clears it. All or none.
 */
export async function assignEntries(competitionId: string, assignments: readonly Assignment[]) {
  await prisma.$transaction(
    async (tx) => {
      await lockAll(tx, competitionId);
      for (const { entryIds, divisionId, lineupId } of assignments) {
        for (const id of entryIds) {
          const entry = await tx.entry.findFirst({
            where: { id, contest: { competitionId } },
            include: { starter: true },
          });
          if (!entry) throw new DomainError('NOT_FOUND');
          if (entry.withdrawnAt) throw new DomainError('ENTRY_WITHDRAWN');
          const { starterId, starter, contestId } = entry;
          await saveEntry(
            tx,
            competitionId,
            { starterId, sex: starter.sex },
            { contestId, divisionId, lineupId },
          );
        }
      }
    },
    { timeout: IMPORT_TIMEOUT_MS },
  );
  publish(competitionId, 'starters');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type StarterWithRelations = Prisma.StarterGetPayload<{ include: typeof STARTER_INCLUDE }>;

function toResult(starter: StarterWithRelations) {
  return { ...starter, differsFromAthlete: !isSamePerson(starter, starter.athlete) };
}

async function lockAll(tx: Prisma.TransactionClient, competitionId: string) {
  await lockCompetition(tx, competitionId);
  await lockAthletes(tx);
  await lockDivisions(tx, competitionId);
}

function parse<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT');
  return result.data;
}

function withoutUndefined<T extends object>(object: T) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as {
    [Key in keyof T]: Exclude<T[Key], undefined>;
  };
}

async function assertClub(tx: Prisma.TransactionClient, clubId: string) {
  const club = await tx.club.findUnique({ where: { id: clubId } });
  if (!club) throw new DomainError('NOT_FOUND');
}

async function assertNotStarting(
  tx: Prisma.TransactionClient,
  competitionId: string,
  athleteId: string,
) {
  const existing = await tx.starter.findUnique({
    where: { competitionId_athleteId: { competitionId, athleteId } },
  });
  if (existing) throw new DomainError('ATHLETE_ALREADY_STARTS');
}

async function addStarter(
  tx: Prisma.TransactionClient,
  competitionId: string,
  { clubId, athleteId, entries = [], ...input }: NewStarter,
  mayChangeClub: (starterId: string) => boolean,
): Promise<{ starterId: string; outcome: Outcome; clubChange?: 'changed' | 'kept' }> {
  const { stvId, ...person } = parse(starterSchema, input);
  await assertClub(tx, clubId);
  const athlete = await resolveAthlete(tx, competitionId, { athleteId, stvId, ...person });

  const key = { competitionId, athleteId: athlete.id };
  const existing = await tx.starter.findUnique({
    where: { competitionId_athleteId: key },
    include: { entries: true },
  });
  const isRemoved = existing?.deletedAt != null;
  const hasOtherClub = existing !== null && !isRemoved && existing.clubId !== clubId;
  const changesClub = hasOtherClub && mayChangeClub(existing.id);
  const starter = existing
    ? await tx.starter.update({
        where: { id: existing.id },
        data: isRemoved
          ? { ...person, clubId, deletedAt: null }
          : { clubId: changesClub ? clubId : undefined },
      })
    : await tx.starter.create({ data: { ...key, ...person, clubId } });

  const patches = [...entries];
  if (existing && isRemoved) {
    await tx.entry.updateMany({
      where: { starterId: existing.id },
      data: { withdrawnAt: null },
    });
    const patched = new Set(entries.map(({ contestId }) => contestId));
    for (const { contestId } of existing.entries) {
      if (!patched.has(contestId)) patches.push({ contestId });
    }
  }
  for (const patch of patches) {
    await saveEntry(tx, competitionId, { starterId: starter.id, sex: starter.sex }, patch);
  }
  return {
    starterId: starter.id,
    outcome: !existing ? 'created' : isRemoved ? 'restored' : 'existing',
    clubChange: !hasOtherClub ? undefined : changesClub ? 'changed' : 'kept',
  };
}

/** Creates or changes an entry. Division and lineup always fit contest, category and sex. */
async function saveEntry(
  tx: Prisma.TransactionClient,
  competitionId: string,
  { starterId, sex }: { starterId: string; sex: Sex },
  patch: EntryPatch,
) {
  const { contestId } = patch;
  const { module } = await getContest(competitionId, contestId, tx);
  const entry = await tx.entry.findUnique({
    where: { contestId_starterId: { contestId, starterId } },
    include: { division: true },
  });

  const categories = module.categories(sex);
  if (patch.category && !categories.includes(patch.category)) {
    throw new DomainError('INVALID_CATEGORY');
  }
  const wanted = patch.category === undefined ? entry?.category : patch.category;
  const category = wanted && categories.includes(wanted) ? wanted : null;

  const fits = (division: { category: string; sex: Sex }) =>
    division.category === category && division.sex === sex;
  let divisionId: string | null = null;
  if (patch.divisionId) {
    const division = await tx.division.findFirst({ where: { id: patch.divisionId, contestId } });
    if (!division) throw new DomainError('NOT_FOUND');
    if (!fits(division)) throw new DomainError('DIVISION_MISMATCH');
    divisionId = division.id;
  } else if (patch.divisionId === undefined && entry?.division && fits(entry.division)) {
    divisionId = entry.division.id;
  }

  let lineupId: string | null = null;
  if (patch.lineupId) {
    const lineup = await tx.lineup.findUnique({ where: { id: patch.lineupId } });
    if (!lineup || lineup.divisionId !== divisionId) throw new DomainError('LINEUP_MISMATCH');
    lineupId = lineup.id;
  } else if (patch.lineupId === undefined && divisionId === entry?.divisionId) {
    lineupId = entry?.lineupId ?? null;
  }

  let position = entry?.position ?? 0;
  if (lineupId && lineupId !== entry?.lineupId) {
    position = nextPosition(await tx.entry.findMany({ where: { lineupId } }));
  }

  const data = { category, divisionId, lineupId, position };
  await tx.entry.upsert({
    where: { contestId_starterId: { contestId, starterId } },
    create: { contestId, starterId, ...data },
    update: data,
  });
}

/** Sheets often name divisions that were not created yet. They are ignored. */
async function findDivisionId(
  tx: Prisma.TransactionClient,
  {
    contestId,
    category,
    sex,
    number,
  }: { contestId: string; category?: string | null; sex?: Sex; number?: number | null },
) {
  if (!category || !sex || !number) return undefined;
  const division = await tx.division.findUnique({
    where: { contestId_category_sex_number: { contestId, category, sex, number } },
  });
  return division?.id;
}
