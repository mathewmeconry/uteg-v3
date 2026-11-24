import { getContestModule } from '~/modules/registry';
import { formatGrade } from './domain/grade';
import { getJudgingState } from './judging.server';
import { prisma } from './prisma.server';

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

/** What happens on each ground: running divisions and, per apparatus, the round and who is next. */
export async function getLiveGrounds(competitionId: string, grounds: number) {
  return Promise.all(
    Array.from({ length: grounds }, async (_, index) => {
      const state = await getJudgingState(competitionId, index + 1);
      const apparatusInUse = state.apparatus.filter(({ status }) => status !== 'WAITING');
      const firstRound = Math.min(
        ...apparatusInUse.map(({ currentRound, rounds }) => currentRound ?? rounds.length),
      );
      return {
        ground: state.ground,
        divisions: state.divisions.map(
          ({ id, contestId, category, sex, number, round, rounds, progress }) => {
            const confirmed = Object.values(progress).reduce((sum, count) => sum + count, 0);
            const percent = Math.round((100 * confirmed) / rounds ** 2);
            return { id, contestId, category, sex, number, round, rounds, percent };
          },
        ),
        apparatus: apparatusInUse.map(({ apparatus, status, currentRound, rounds }) => {
          const slots = currentRound === null ? [] : rounds[currentRound].slots;
          const active = slots.filter(({ withdrawn }) => !withdrawn);
          const next = active.find(({ grade }) => !grade);
          return {
            apparatus,
            status,
            /** 1-based, the last one when finished. */
            round: currentRound === null ? rounds.length : currentRound + 1,
            rounds: rounds.length,
            /** Confirmed its round while others are still in it. */
            isAhead: currentRound !== null && currentRound > firstRound,
            graded: active.filter(({ grade }) => grade).length,
            total: active.length,
            next: next ? `${next.firstname} ${next.lastname}` : null,
          };
        }),
      };
    }),
  );
}
