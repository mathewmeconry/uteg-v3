import type { Sex } from '~/generated/prisma/enums';
import { getContest } from './contests.server';
import { listDivisions } from './divisions.server';

/** What a starter can be assigned to in a contest. */
export type ContestOptions = Awaited<ReturnType<typeof getContestOptions>>;
export type DivisionOption = ContestOptions['divisions'][number];

export async function getContestOptions(competitionId: string, contestId: string) {
  const { module, id, name } = await getContest(competitionId, contestId);
  const divisions = await listDivisions(competitionId, { contestId });
  const categories: Record<Sex, readonly string[]> = {
    FEMALE: module.categories('FEMALE'),
    MALE: module.categories('MALE'),
  };
  const apparatus = [...new Set([...module.apparatus('MALE'), ...module.apparatus('FEMALE')])];

  return {
    id,
    name,
    categories,
    /** In rotation order. */
    apparatus,
    divisions: divisions.map((division) => ({
      id: division.id,
      category: division.category,
      sex: division.sex,
      number: division.number,
      lineups: division.lineups
        .map(({ id: lineupId, apparatus: key }) => ({ id: lineupId, apparatus: key }))
        .toSorted((a, b) => apparatus.indexOf(a.apparatus) - apparatus.indexOf(b.apparatus)),
    })),
  };
}
