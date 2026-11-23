import type { Prisma } from '~/generated/prisma/client';
import { getContestModule, getContestsApparatus } from '~/modules/registry';
import type { InputRule } from '~/modules/types';
import { aggregate, isGrade } from './domain/grade';
import { isSameGrade, type StoredGrade } from './domain/gradeInput';
import { getCurrentRound, isEnded } from './domain/progress';
import { compareDivisions, getRoundCount, getRoundList, isVisible } from './domain/rotation';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockDivisions } from './locks.server';
import { prisma } from './prisma.server';

export type GradeInput = {
  entryId: string;
  apparatus: string;
  /** Thousandths. The final grade, used unless attempts are given. */
  value?: number;
  /** Thousandths. The final grade is computed from all of them. */
  attempts?: number[];
  /**
   * The saved grade that was shown when the input started. Given, a grade that someone else saved
   * since is not overwritten.
   */
  previous?: StoredGrade | null;
};

/** Judges may only grade what their tablet shows, editors also before and after the division. */
export type GradeScope = { kind: 'editor' } | { kind: 'judge'; ground: number; apparatus: string };

export type JudgingState = Awaited<ReturnType<typeof getJudgingState>>;
export type GradingState = Awaited<ReturnType<typeof getGradingState>>;
export type JudgingRound = JudgingState['apparatus'][number]['rounds'][number];
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
  const saved = await prisma.$transaction(async (tx) => {
    const ids = grades.map(({ entryId }) => entryId);
    // Two devices grading the same entry take turns, the second one sees the first one's grade.
    await tx.$queryRaw`
      SELECT id FROM entry WHERE id = ANY(${ids}::text[]) ORDER BY id FOR NO KEY UPDATE`;
    const entries = await tx.entry.findMany({
      where: { id: { in: ids }, contest: { competitionId } },
      include: { ...GRADED_ENTRY, grades: true },
    });
    const result = [];
    for (const input of grades) {
      const { entryId, apparatus } = input;
      const entry = entries.find(({ id }) => id === entryId);
      const data = computeGrade(input, getGradeableRule(entry, apparatus, scope));
      const current = entry?.grades.find((grade) => grade.apparatus === apparatus) ?? null;
      const isUnchanged =
        input.previous === undefined ||
        isSameGrade(current, input.previous) ||
        // Sent again because the first response got lost.
        isSameGrade(current, data);
      if (!isUnchanged) throw new DomainError('GRADE_CHANGED');
      result.push(
        await tx.grade.upsert({
          where: { entryId_apparatus: { entryId, apparatus } },
          create: { entryId, apparatus, ...data },
          update: data,
        }),
      );
    }
    return result;
  });
  publish(competitionId, 'grades');
  return saved;
}

export async function deleteGrade(
  competitionId: string,
  { entryId, apparatus }: { entryId: string; apparatus: string },
  scope: GradeScope,
) {
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, contest: { competitionId } },
    include: GRADED_ENTRY,
  });
  getGradeableRule(entry, apparatus, scope);
  await prisma.grade.deleteMany({ where: { entryId, apparatus } });
  publish(competitionId, 'grades');
}

// ── Rounds ───────────────────────────────────────────────────────────────────

/**
 * Confirms a round of an apparatus, also an empty one. Repeating it changes nothing. Divisions
 * whose apparatus have all confirmed every round end.
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
    if (round < 0 || open.some((division) => completed(division, apparatus) !== round)) {
      throw new DomainError('ROUND_NOT_CURRENT');
    }
    const missing = getSlots(open, apparatus, round).some(
      ({ withdrawn, grade }) => !withdrawn && !grade,
    );
    if (missing) throw new DomainError('GRADES_MISSING');

    for (const division of open) {
      await tx.$executeRaw`
        UPDATE division_progress
        SET "completedRounds" = GREATEST("completedRounds", ${round + 1})
        WHERE "divisionId" = ${division.id} AND apparatus = ${apparatus}`;
      const progress = await tx.divisionProgress.findMany({ where: { divisionId: division.id } });
      if (isEnded(progress)) {
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

const GRADED_ENTRY = { contest: true, division: true, starter: true } as const;
type GradedEntry = Prisma.EntryGetPayload<{ include: typeof GRADED_ENTRY }>;

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
        ? { value: grade.value, attempts: grade.attempts, updatedAt: grade.updatedAt }
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

function computeGrade({ value, attempts = [] }: GradeInput, rule: InputRule) {
  if (attempts.length > 0) {
    const final = aggregate(attempts, rule.aggregation);
    if (attempts.length !== rule.attempts || !attempts.every(isGrade) || final === null) {
      throw new DomainError('INVALID_GRADE');
    }
    // A single attempt is the final grade.
    return { value: final, attempts: rule.attempts > 1 ? attempts : [] };
  }
  if (value === undefined || !isGrade(value)) throw new DomainError('INVALID_GRADE');
  return { value, attempts: [] };
}
