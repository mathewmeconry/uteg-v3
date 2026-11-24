import { z } from 'zod';
import type { Prisma, Sex } from '~/generated/prisma/client';
import { changeStvId, matchAthlete, resolveAthlete } from './athletes.server';
import { getContest } from './contests.server';
import {
  isSamePerson,
  starterSchema,
  starterUpdateSchema,
  withoutNul,
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
  startApparatus?: string | null;
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
/** `changesClub` is only set for those that take part with another club. */
type Added = { starterId: string; outcome: Outcome; changesClub?: boolean };

const IMPORT_CHUNK_SIZE = 25;
const ASSIGN_TIMEOUT_MS = 60_000;

const importRowSchema = starterSchema.extend({
  athleteId: withoutNul(z.string().max(50)).nullish(),
  category: withoutNul(z.string().max(50)).nullish(),
  divisionNumber: z.int32().nullish(),
});

// ── Reading ──────────────────────────────────────────────────────────────────

const STARTER_INCLUDE = {
  club: true,
  athlete: true,
  entries: { include: { division: true } },
} satisfies Prisma.StarterInclude;

/** All of them, or those with the ids. */
export async function listStarters(competitionId: string, ids?: string[]) {
  const starters = await prisma.starter.findMany({
    where: { id: ids && { in: ids }, competitionId, deletedAt: null },
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
  publish(competitionId, 'starters', [result.starterId]);
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
  for (const row of rows) {
    try {
      const { category: _, divisionNumber: __, ...data } = parse(importRowSchema, row);
      const athlete = await matchAthlete(prisma, competitionId, data);
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
    club: { id: club.id, name: club.name, location: club.location },
  }));
}

/**
 * Adds the rows that are valid and reports the others by their index. Rows are committed in chunks,
 * so judges and other competitions never wait for a whole file. Importing a file again finds the
 * starters of the first time. Those that already take part keep their club, unless they are in
 * `changeClubOf`.
 */
export async function importStarters(
  competitionId: string,
  {
    contestId,
    clubId,
    rows,
    changeClubOf = [],
  }: {
    contestId: string;
    clubId: string;
    rows: readonly ImportRow[];
    /** Ids of starters. */
    changeClubOf?: readonly string[];
  },
) {
  await getContest(competitionId, contestId);
  await assertClub(prisma, clubId);

  const changing = new Set(changeClubOf);
  const changesClub = (starterId: string) => changing.has(starterId);
  const clubChanges = new Map<string, boolean>();
  const counts: Record<Outcome, number> = { created: 0, restored: 0, existing: 0 };
  const failures: { index: number; code: DomainErrorCode }[] = [];
  try {
    for (let start = 0; start < rows.length; start += IMPORT_CHUNK_SIZE) {
      const results = await prisma.$transaction(async (tx) => {
        await lockAll(tx, competitionId);
        const chunk = [];
        for (const row of rows.slice(start, start + IMPORT_CHUNK_SIZE)) {
          chunk.push(await importRow(tx, competitionId, { contestId, clubId, row, changesClub }));
        }
        return chunk;
      });
      for (const [offset, result] of results.entries()) {
        if ('code' in result) {
          failures.push({ index: start + offset, code: result.code });
          continue;
        }
        counts[result.outcome]++;
        if (result.changesClub != null) clubChanges.set(result.starterId, result.changesClub);
      }
    }
  } finally {
    publish(competitionId, 'starters');
  }
  const clubsChanged = [...clubChanges.values()].filter(Boolean).length;
  return { ...counts, clubsChanged, clubsKept: clubChanges.size - clubsChanged, failures };
}

// ── Changing ─────────────────────────────────────────────────────────────────

export async function updateStarter(
  competitionId: string,
  starterId: string,
  { clubId, entries = [], updateAthlete = false, ...input }: StarterUpdate,
) {
  const { stvId, ...person } = parse(starterUpdateSchema, input);

  await prisma.$transaction(async (tx) => {
    const find = async () => {
      const starter = await tx.starter.findFirst({
        where: { id: starterId, competitionId, deletedAt: null },
        include: { athlete: true, entries: true },
      });
      if (!starter) throw new DomainError('NOT_FOUND');
      return starter;
    };
    await lockCompetition(tx, competitionId);
    let before = await find();
    const changesStvId = stvId !== undefined && stvId !== before.athlete.stvId;
    if (changesStvId || updateAthlete) {
      await lockAthletes(tx);
      // Another competition may have changed the athlete.
      before = await find();
    }
    await lockDivisions(tx, competitionId);
    if (clubId !== undefined) await assertClub(tx, clubId);
    if (person.sex !== undefined) await assertSex(tx, competitionId, person.sex);

    const after = { ...before, ...withoutUndefined(person) };
    const athlete = changesStvId ? await changeStvId(tx, after, stvId) : before.athlete;
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
  publish(competitionId, 'starters', [starterId]);
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
  publish(competitionId, 'starters', starterIds);
}

export type Assignment = { entryIds: string[]; divisionId: string; startApparatus?: string | null };

/**
 * Puts groups of entries into a division, and at the end of a lineup if given. Without a lineup they
 * keep theirs as far as it belongs to the division, null clears it. All or none. Returns the ids of
 * the starters.
 */
export async function assignEntries(competitionId: string, assignments: readonly Assignment[]) {
  const starterIds = new Set<string>();
  await prisma.$transaction(
    async (tx) => {
      await lockCompetition(tx, competitionId);
      await lockDivisions(tx, competitionId);
      for (const { entryIds, divisionId, startApparatus } of assignments) {
        for (const id of entryIds) {
          const entry = await tx.entry.findFirst({
            where: { id, contest: { competitionId } },
            include: { starter: true },
          });
          if (!entry) throw new DomainError('NOT_FOUND');
          if (entry.withdrawnAt) throw new DomainError('ENTRY_WITHDRAWN');
          const { starterId, starter, contestId } = entry;
          starterIds.add(starterId);
          await saveEntry(
            tx,
            competitionId,
            { starterId, sex: starter.sex },
            { contestId, divisionId, startApparatus },
          );
        }
      }
    },
    { timeout: ASSIGN_TIMEOUT_MS },
  );
  publish(competitionId, 'starters', [...starterIds]);
  return [...starterIds];
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

async function importRow(
  tx: Prisma.TransactionClient,
  competitionId: string,
  {
    contestId,
    clubId,
    row,
    changesClub,
  }: {
    contestId: string;
    clubId: string;
    row: ImportRow;
    changesClub: (starterId: string) => boolean;
  },
): Promise<Added | { code: DomainErrorCode }> {
  // A failing row must not undo the others, nor leave a part of itself.
  await tx.$executeRaw`SAVEPOINT import_row`;
  try {
    const { category, divisionNumber, ...starter } = parse(importRowSchema, row);
    const divisionId = await findDivisionId(tx, {
      contestId,
      category,
      sex: starter.sex,
      number: divisionNumber,
    });
    const added = await addStarter(
      tx,
      competitionId,
      {
        ...starter,
        clubId,
        entries: [{ contestId, category: category || undefined, divisionId }],
      },
      changesClub,
    );
    await tx.$executeRaw`RELEASE SAVEPOINT import_row`;
    return added;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT import_row`;
    return { code: error.code };
  }
}

async function assertClub(tx: Prisma.TransactionClient, clubId: string) {
  const club = await tx.club.findUnique({ where: { id: clubId } });
  if (!club) throw new DomainError('NOT_FOUND');
}

async function assertSex(tx: Prisma.TransactionClient, competitionId: string, sex: Sex) {
  const { sexes } = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (!sexes.includes(sex)) throw new DomainError('SEX_NOT_ALLOWED');
}

async function assertNotStarting(
  tx: Prisma.TransactionClient,
  competitionId: string,
  athleteId: string,
) {
  const existing = await tx.starter.findUnique({
    where: { competitionId_athleteId: { competitionId, athleteId } },
  });
  if (existing?.deletedAt) throw new DomainError('STARTER_REMOVED');
  if (existing) throw new DomainError('ATHLETE_ALREADY_STARTS');
}

async function addStarter(
  tx: Prisma.TransactionClient,
  competitionId: string,
  { clubId, athleteId, entries = [], ...input }: NewStarter,
  /** Of someone who takes part with another club. */
  changesClub: (starterId: string) => boolean,
): Promise<Added> {
  const { stvId, ...person } = parse(starterSchema, input);
  await assertSex(tx, competitionId, person.sex);
  await assertClub(tx, clubId);
  const athlete = await resolveAthlete(tx, competitionId, { athleteId, stvId, ...person });

  const key = { competitionId, athleteId: athlete.id };
  const existing = await tx.starter.findUnique({
    where: { competitionId_athleteId: key },
    include: { entries: true },
  });
  const isRemoved = existing?.deletedAt != null;
  const clubChange =
    existing && !isRemoved && existing.clubId !== clubId ? changesClub(existing.id) : undefined;
  const starter = existing
    ? await tx.starter.update({
        where: { id: existing.id },
        data: isRemoved
          ? { ...person, clubId, deletedAt: null }
          : { clubId: clubChange ? clubId : undefined },
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
    changesClub: clubChange,
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

  const isSameDivision = divisionId === entry?.divisionId;
  let startApparatus: string | null = null;
  if (patch.startApparatus) {
    if (!divisionId || !module.apparatus(sex).includes(patch.startApparatus)) {
      throw new DomainError('INVALID_APPARATUS');
    }
    startApparatus = patch.startApparatus;
  } else if (patch.startApparatus === undefined && isSameDivision) {
    startApparatus = entry?.startApparatus ?? null;
  }

  let position = entry?.position ?? 0;
  if (startApparatus && !(isSameDivision && startApparatus === entry?.startApparatus)) {
    position = nextPosition(await tx.entry.findMany({ where: { divisionId, startApparatus } }));
  }

  const data = { category, divisionId, startApparatus, position };
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
