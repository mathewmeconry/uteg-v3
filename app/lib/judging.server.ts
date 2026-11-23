import type { Grade, Prisma } from '~/generated/prisma/client';
import { getContestModule, getContestsApparatus } from '~/modules/registry';
import type { InputRule } from '~/modules/types';
import { aggregate, isAttempt, isGrade } from './domain/grade';
import { isSameGrade } from './domain/gradeInput';
import { getCurrentRound, isEnded } from './domain/progress';
import {
  compareDivisions,
  getRoundCount,
  getRoundList,
  isVisible,
  startApparatus,
} from './domain/rotation';
import { DomainError, type MissingGrade } from './errors';
import { publish } from './events.server';
import { lockContestConfigs, lockDivisions } from './locks.server';
import { prisma } from './prisma.server';

export type GradeInput = {
  entryId: string;
  apparatus: string;
  /** Thousandths. The final grade, used unless attempts are given. */
  value?: number;
  /** Thousandths. The final grade is computed from all of them. */
  attempts?: number[];
  /**
   * The saved grade that was shown when the input started. Given, a grade that was saved since is
   * not overwritten, so a request that arrives late cannot replace a newer one.
   */
  previous?: GradeVersion | null;
  /** The same for every repetition of a request. */
  requestId?: string;
  /** Requests of the same device that got no answer and may be replaced. */
  supersedes?: string[];
};

/** With the id, because a deleted grade that is entered again starts with the same version. */
export type GradeVersion = { id: string; version: number };

/** Judges may only grade what their tablet shows, editors also before and after the division. */
export type GradeScope = { kind: 'editor' } | { kind: 'judge'; ground: number; apparatus: string };

export type JudgingState = Awaited<ReturnType<typeof getJudgingState>>;
export type GradingState = Awaited<ReturnType<typeof getGradingState>>;
type JudgingRound = JudgingState['apparatus'][number]['rounds'][number];
export type JudgingSlot = JudgingRound['slots'][number];

// ── State ────────────────────────────────────────────────────────────────────

/**
 * What the tablets on a ground show: the running divisions of all contests.
 *
 * Divisions started at the same time are in the same round on an apparatus and judged as one list.
 * A division started while others are mid-way is behind them. The tablet then shows the lowest
 * unfinished round on its apparatus with only the divisions that are in it. The others wait until
 * the late one has caught up and are merged with it from then on. This way every round has one
 * list, no division skips a round and grades of a waiting division are kept.
 */
export async function getJudgingState(competitionId: string, ground: number, apparatus?: string) {
  const divisions = await loadDivisions(competitionId, { ground, state: 'RUNNING' });
  const keys = apparatus ? [apparatus] : await getApparatusOrder(competitionId);
  const ended = await prisma.division.findMany({
    where: { ground, state: 'ENDED', contest: { competitionId } },
    select: { id: true },
  });

  return {
    ground,
    divisions: divisions.map(toSummary),
    /** Tells a division that ended from one that was stopped. */
    endedIds: ended.map(({ id }) => id),
    apparatus: keys.map((key) => toApparatusState(divisions, key)),
  };
}

/** How long a display shows the last grades after the last division ended. */
const DISPLAY_LINGER_MS = 5 * 60_000;

/**
 * What the displays on a ground show: the running divisions, or the ones that ended a moment ago.
 * The round is the one of the slowest division.
 */
export async function getDisplayState(competitionId: string, ground: number, now = new Date()) {
  const running = await loadDivisions(competitionId, { ground, state: 'RUNNING' });
  const ended = running.length
    ? []
    : await loadDivisions(competitionId, {
        ground,
        state: 'ENDED',
        endedAt: { gt: new Date(now.getTime() - DISPLAY_LINGER_MS) },
      });
  const divisions = running.length ? running : ended;
  const lastRound = (division: LoadedDivision) =>
    Math.min(getCurrentRound(division.progress), division.rounds - 1);
  const hidesAt = Math.max(...ended.map(({ endedAt }) => Number(endedAt) + DISPLAY_LINGER_MS));

  return {
    divisionIds: divisions.map(({ id }) => id),
    round: divisions.length ? Math.min(...divisions.map(lastRound)) : 0,
    /** Null while divisions run or nothing is shown. */
    hidesInMs: ended.length ? hidesAt - now.getTime() : null,
    apparatus: (await getApparatusOrder(competitionId))
      .map((key) => toApparatusState(divisions, key))
      .filter(({ status }) => status !== 'WAITING'),
  };
}

/**
 * All rounds of some divisions, for grading tables and judging sheets. With ids in any state,
 * otherwise the running ones of the ground.
 */
export async function getGradingState(
  competitionId: string,
  filter: { divisionIds: string[] } | { ground: number },
) {
  const divisions = await loadDivisions(
    competitionId,
    'divisionIds' in filter
      ? { id: { in: filter.divisionIds } }
      : { ground: filter.ground, state: 'RUNNING' },
  );
  const order = await getApparatusOrder(competitionId);
  const keys = order.filter((key) => divisions.some(({ apparatus }) => apparatus.includes(key)));

  return {
    divisions: divisions.map(toSummary),
    apparatus: keys.map((key) => ({
      apparatus: key,
      rounds: Array.from({ length: getRoundCount(divisions, key) }, (_, round) => ({
        round,
        slots: getSlots(divisions, key, round),
      })),
    })),
  };
}

// ── Grades ───────────────────────────────────────────────────────────────────

/** Saves all grades or none. */
export async function saveGrades(
  competitionId: string,
  grades: readonly GradeInput[],
  scope: GradeScope,
) {
  // In one order, so two devices saving the same grades cannot block each other.
  const sorted = grades.toSorted((a, b) =>
    a.entryId === b.entryId
      ? Number(a.apparatus > b.apparatus) - Number(a.apparatus < b.apparatus)
      : a.entryId < b.entryId
        ? -1
        : 1,
  );
  const saved = await prisma.$transaction(async (tx) => {
    const ids = grades.map(({ entryId }) => entryId);
    await lockContestConfigs(tx, competitionId);
    const entries = await lockGradedEntries(tx, competitionId, ids);
    // Two devices grading the same entry take turns, the second one sees the first one's grade.
    await tx.$queryRaw`
      SELECT id FROM entry WHERE id = ANY(${ids}::text[]) ORDER BY id FOR NO KEY UPDATE`;
    const stored = await tx.grade.findMany({ where: { entryId: { in: ids } } });
    const result = new Map<GradeInput, Grade>();
    for (const input of sorted) {
      const { entryId, apparatus } = input;
      const entry = entries.find(({ id }) => id === entryId);
      const data = computeGrade(input, getGradeableRule(entry, apparatus, scope));
      const current =
        stored.find((grade) => grade.entryId === entryId && grade.apparatus === apparatus) ?? null;
      const { requestId = null, supersedes = [] } = input;
      const isRepeated = requestId !== null && current?.requestId === requestId;
      const isOwn = current?.requestId != null && supersedes.includes(current.requestId);
      const isExpected =
        input.previous === undefined || isSameVersion(current, input.previous) || isOwn;
      if (current && (isRepeated || (!isExpected && isSameGrade(current, data)))) {
        result.set(input, current);
        continue;
      }
      if (!isExpected) throw new DomainError('GRADE_CHANGED');
      // Saving the same value counts as well: a late request must not replace it.
      result.set(
        input,
        await tx.grade.upsert({
          where: { entryId_apparatus: { entryId, apparatus } },
          create: { entryId, apparatus, requestId, ...data },
          update: { ...data, requestId, version: { increment: 1 } },
        }),
      );
    }
    return grades.map((input) => result.get(input)!);
  });
  publish(competitionId, 'grades');
  return saved;
}

/**
 * Judges may correct the grades of confirmed rounds but not delete them. `previous` is the grade
 * that was shown, see GradeInput.
 */
export async function deleteGrade(
  competitionId: string,
  { entryId, apparatus, previous }: { entryId: string; apparatus: string; previous?: GradeVersion },
  scope: GradeScope,
) {
  await prisma.$transaction(async (tx) => {
    const [entry] = await lockGradedEntries(tx, competitionId, [entryId]);
    getGradeableRule(entry, apparatus, scope);
    if (scope.kind === 'judge' && isConfirmed(entry, apparatus)) {
      throw new DomainError('ROUND_NOT_CURRENT');
    }
    const where = { entryId, apparatus };
    const { count } = await tx.grade.deleteMany({ where: { ...where, ...previous } });
    // Already deleted is fine.
    if (count === 0 && (await tx.grade.count({ where })) > 0) {
      throw new DomainError('GRADE_CHANGED');
    }
  });
  publish(competitionId, 'grades');
}

// ── Rounds ───────────────────────────────────────────────────────────────────

/**
 * Confirms a round of an apparatus, also an empty one. Repeating it changes nothing. Divisions
 * whose apparatus have all confirmed every round end, unless grades are missing: an editor may
 * have deleted one or moved somebody to a lineup that had already passed an apparatus. Then an
 * editor has to enter them before the round can be confirmed.
 */
export async function confirmRound(
  competitionId: string,
  {
    ground,
    apparatus,
    round,
    divisionIds,
  }: { ground: number; apparatus: string; round: number; divisionIds: string[] },
) {
  if (divisionIds.length === 0) throw new DomainError('NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    await lockDivisions(tx, competitionId, divisionIds);
    const divisions = await loadDivisions(competitionId, { id: { in: divisionIds }, ground }, tx);
    if (divisions.length !== new Set(divisionIds).size) throw new DomainError('NOT_FOUND');
    if (divisions.some((division) => !division.apparatus.includes(apparatus))) {
      throw new DomainError('INVALID_APPARATUS');
    }
    const open = divisions.filter(
      (division) => division.state === 'PENDING' || completed(division, apparatus) <= round,
    );
    if (open.some(({ state }) => state !== 'RUNNING')) {
      throw new DomainError('DIVISION_NOT_RUNNING');
    }
    const isCurrent = (division: LoadedDivision) =>
      round < division.rounds && completed(division, apparatus) === round;
    if (round < 0 || !open.every(isCurrent)) throw new DomainError('ROUND_NOT_CURRENT');
    assertGraded(
      getSlots(open, apparatus, round)
        .filter(({ withdrawn, grade }) => !withdrawn && !grade)
        .map((slot) => toMissingGrade(slot.entryId, slot, apparatus)),
    );

    for (const division of open) {
      await tx.$executeRaw`
        UPDATE division_progress
        SET "completedRounds" = GREATEST("completedRounds", ${round + 1})
        WHERE "divisionId" = ${division.id} AND apparatus = ${apparatus}`;
      const progress = await tx.divisionProgress.findMany({ where: { divisionId: division.id } });
      if (isEnded(progress)) {
        assertGraded(getMissingGrades(division));
        await tx.division.update({
          where: { id: division.id },
          data: { state: 'ENDED', endedAt: new Date() },
        });
      }
    }
  });
  publish(competitionId, 'divisions');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const GRADED_ENTRY = {
  contest: true,
  division: { include: { progress: true } },
  lineup: true,
  starter: true,
} as const;
type GradedEntry = Prisma.EntryGetPayload<{ include: typeof GRADED_ENTRY }>;

/** The entries, with their divisions kept in their state until the end of the transaction. */
async function lockGradedEntries(
  tx: Prisma.TransactionClient,
  competitionId: string,
  entryIds: string[],
) {
  const locked = new Set<string>();
  for (;;) {
    const entries = await tx.entry.findMany({
      where: { id: { in: entryIds }, contest: { competitionId } },
      include: GRADED_ENTRY,
    });
    const ids = entries.flatMap(({ divisionId }) => divisionId ?? []);
    const unlocked = [...new Set(ids)].filter((id) => !locked.has(id));
    if (unlocked.length === 0) return entries;
    // Waiting for the lock takes time, the entries may have changed meanwhile.
    await lockDivisions(tx, competitionId, unlocked, 'SHARE');
    for (const id of unlocked) locked.add(id);
  }
}

/** Whether the apparatus has confirmed the round in which the entry is there. */
function isConfirmed({ contest, division, lineup }: GradedEntry, apparatus: string) {
  if (!division || !lineup) return false;
  const order = getContestModule(contest).apparatus(division.sex);
  const row = division.progress.find((item) => item.apparatus === apparatus);
  return Array.from({ length: row?.completedRounds ?? 0 }).some(
    (_, round) => startApparatus(order, apparatus, round) === lineup.apparatus,
  );
}

function assertGraded(missing: MissingGrade[]) {
  if (missing.length > 0) throw new DomainError('GRADES_MISSING', { missing });
}

function toMissingGrade(
  entryId: string,
  { firstname, lastname }: { firstname: string; lastname: string },
  apparatus: string,
): MissingGrade {
  return { entryId, firstname, lastname, apparatus };
}

/** What the entries in the division's lineups still need on any apparatus. */
function getMissingGrades({ lineups, apparatus }: LoadedDivision) {
  return Object.values(lineups)
    .flat()
    .filter(({ withdrawnAt }) => !withdrawnAt)
    .flatMap(({ id, starter, grades }) =>
      apparatus
        .filter((key) => !grades.some((grade) => grade.apparatus === key))
        .map((key) => toMissingGrade(id, starter, key)),
    );
}

type LoadedDivision = Awaited<ReturnType<typeof loadDivisions>>[number];

async function loadDivisions(
  competitionId: string,
  where: Prisma.DivisionWhereInput,
  tx: Prisma.TransactionClient = prisma,
) {
  const divisions = await tx.division.findMany({
    where: { ...where, contest: { competitionId } },
    include: {
      contest: true,
      progress: true,
      lineups: {
        include: {
          entries: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            include: { grades: true, starter: { include: { club: true } } },
          },
        },
      },
    },
  });
  return divisions
    .map(({ contest, lineups, progress, ...division }) => {
      const module = getContestModule(contest);
      const apparatus = module.apparatus(division.sex);
      return {
        ...division,
        module,
        apparatus,
        rounds: apparatus.length,
        progress,
        lineups: Object.fromEntries(lineups.map((lineup) => [lineup.apparatus, lineup.entries])),
      };
    })
    .toSorted(compareDivisions);
}

function toApparatusState(divisions: readonly LoadedDivision[], key: string) {
  const here = divisions.filter((division) => division.apparatus.includes(key));
  const unfinished = here.filter((division) => completed(division, key) < division.rounds);
  const currentRound = unfinished.length
    ? Math.min(...unfinished.map((division) => completed(division, key)))
    : null;
  return {
    apparatus: key,
    status: here.length === 0 ? 'WAITING' : currentRound === null ? 'FINISHED' : 'JUDGING',
    currentRound,
    /** The divisions to confirm the current round for. */
    divisionIds: unfinished
      .filter((division) => completed(division, key) === currentRound)
      .map(({ id }) => id),
    rounds: Array.from({ length: getRoundCount(here, key) }, (_, round) => {
      const isOver = currentRound === null || round < currentRound;
      const divisionsInRound = isOver
        ? here
        : here.filter((division) => completed(division, key) <= round);
      return { round, slots: getSlots(divisionsInRound, key, round) };
    }),
  } as const;
}

function completed(division: LoadedDivision, apparatus: string) {
  return division.progress.find((row) => row.apparatus === apparatus)?.completedRounds ?? 0;
}

function toSummary(division: LoadedDivision) {
  const { id, contestId, category, sex, number, ground, state, rounds, progress } = division;
  return {
    id,
    contestId,
    category,
    sex,
    number,
    ground,
    state,
    rounds,
    round: getCurrentRound(progress),
    /** Confirmed rounds by apparatus. */
    progress: Object.fromEntries(
      progress.map(({ apparatus, completedRounds }) => [apparatus, completedRounds]),
    ),
  };
}

function getSlots(divisions: readonly LoadedDivision[], apparatus: string, round: number) {
  const byId = new Map(divisions.map((division) => [division.id, division]));
  return getRoundList(divisions, apparatus, round).map((entry) => {
    const { starter } = entry;
    const division = byId.get(entry.divisionId!)!;
    const grade = entry.grades.find((item) => item.apparatus === apparatus);
    return {
      entryId: entry.id,
      starterId: starter.id,
      contestId: entry.contestId,
      divisionId: division.id,
      divisionNumber: division.number,
      category: division.category,
      sex: division.sex,
      firstname: starter.firstname,
      lastname: starter.lastname,
      clubName: starter.club.name,
      withdrawn: entry.withdrawnAt !== null,
      inputRule: division.module.inputRule(apparatus, division.category),
      /** Decimals the ranking and the displays show. */
      precision: division.module.rankingOptions(division.category, division.sex).precision,
      grade: grade
        ? {
            id: grade.id,
            version: grade.version,
            requestId: grade.requestId,
            value: grade.value,
            attempts: grade.attempts,
            updatedAt: grade.updatedAt,
          }
        : null,
    };
  });
}

/** Every apparatus of the competition's contests, in rotation order. */
async function getApparatusOrder(competitionId: string) {
  const contests = await prisma.contest.findMany({
    where: { competitionId },
    orderBy: { position: 'asc' },
  });
  return getContestsApparatus(contests);
}

/** Returns how the grade of the entry is entered, if it may be graded at all. */
function getGradeableRule(
  entry: GradedEntry | null | undefined,
  apparatus: string,
  scope: GradeScope,
): InputRule {
  if (!entry) throw new DomainError('NOT_FOUND');
  if (scope.kind === 'judge') {
    const { division, lineupId } = entry;
    const isOnTablet =
      apparatus === scope.apparatus &&
      lineupId !== null &&
      division?.state === 'RUNNING' &&
      division.ground === scope.ground &&
      isVisible(entry, division);
    if (!isOnTablet) throw new DomainError('ENTRY_NOT_JUDGEABLE');
  }
  if (entry.withdrawnAt) throw new DomainError('ENTRY_WITHDRAWN');
  const module = getContestModule(entry.contest);
  if (!module.apparatus(entry.starter.sex).includes(apparatus)) {
    throw new DomainError('INVALID_APPARATUS');
  }
  return module.inputRule(apparatus, entry.category ?? entry.division?.category ?? '');
}

function isSameVersion(a: GradeVersion | null, b: GradeVersion | null) {
  return a?.id === b?.id && a?.version === b?.version;
}

function computeGrade({ value, attempts = [] }: GradeInput, rule: InputRule) {
  if (attempts.length > 0) {
    const final = aggregate(attempts, rule.aggregation);
    const isValid = rule.attempts > 1 ? isAttempt : isGrade;
    if (attempts.length !== rule.attempts || !attempts.every(isValid) || final === null) {
      throw new DomainError('INVALID_GRADE');
    }
    // A single attempt is the final grade.
    return { value: final, attempts: rule.attempts > 1 ? attempts : [] };
  }
  if (value === undefined || !isGrade(value)) throw new DomainError('INVALID_GRADE');
  return { value, attempts: [] };
}
