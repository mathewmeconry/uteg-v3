import { getContestModule } from '~/modules/registry';
import { formatGrade } from './domain/grade';
import { getJudgingState, type JudgingState } from './judging.server';
import { prisma } from './prisma.server';

const LATEST_PER_APPARATUS = 2;

export type LatestGrade = Awaited<ReturnType<typeof getLatestGrades>>[number];
export type LiveGround = Awaited<ReturnType<typeof getLiveGrounds>>[number];

/** The newest grades of the competition, also of divisions that are not running. */
export async function getLatestGrades(competitionId: string, limit: number) {
  const grades = await prisma.grade.findMany({
    where: { entry: { contest: { competitionId }, withdrawnAt: null } },
    include: {
      entry: { include: { contest: true, division: true, starter: { include: { club: true } } } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return grades.map(({ id, apparatus, value, entry }) => {
    const { contest, division, starter } = entry;
    const category = entry.category ?? division?.category ?? '';
    const { precision } = getContestModule(contest).rankingOptions(category, starter.sex);
    return {
      id,
      apparatus,
      category,
      firstname: starter.firstname,
      lastname: starter.lastname,
      clubName: starter.club.name,
      grade: formatGrade(value, precision),
    };
  });
}

/** What happens on each ground: running divisions and, per apparatus, the round and last grades. */
export async function getLiveGrounds(competitionId: string, grounds: number) {
  const contests = await prisma.contest.findMany({ where: { competitionId } });
  const modules = new Map(contests.map((contest) => [contest.id, getContestModule(contest)]));

  return Promise.all(
    Array.from({ length: grounds }, async (_, index) => {
      const state = await getJudgingState(competitionId, index + 1);
      return {
        ground: state.ground,
        divisions: state.divisions.map(
          ({ id, contestId, category, sex, number, round, rounds, progress }) => {
            const confirmed = Object.values(progress).reduce((sum, count) => sum + count, 0);
            const percent = Math.round((100 * confirmed) / rounds ** 2);
            return { id, contestId, category, sex, number, round, rounds, percent };
          },
        ),
        apparatus: state.apparatus
          .filter(({ status }) => status !== 'WAITING')
          .map(({ apparatus, status, currentRound, rounds }) => {
            const slots = currentRound === null ? [] : rounds[currentRound].slots;
            const active = slots.filter(({ withdrawn }) => !withdrawn);
            return {
              apparatus,
              status,
              /** 1-based, the last one when finished. */
              round: currentRound === null ? rounds.length : currentRound + 1,
              rounds: rounds.length,
              graded: active.filter(({ grade }) => grade).length,
              total: active.length,
              latest: getLatest(rounds).map(({ entryId, contestId, grade, ...slot }) => {
                const options = modules.get(contestId)!.rankingOptions(slot.category, slot.sex);
                return {
                  entryId,
                  firstname: slot.firstname,
                  lastname: slot.lastname,
                  clubName: slot.clubName,
                  grade: formatGrade(grade.value, options.precision),
                };
              }),
            };
          }),
      };
    }),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLatest(rounds: JudgingState['apparatus'][number]['rounds']) {
  return rounds
    .flatMap(({ slots }) => slots)
    .flatMap((slot) => (slot.grade && !slot.withdrawn ? [{ ...slot, grade: slot.grade }] : []))
    .toSorted((a, b) => +b.grade.updatedAt - +a.grade.updatedAt)
    .slice(0, LATEST_PER_APPARATUS);
}
