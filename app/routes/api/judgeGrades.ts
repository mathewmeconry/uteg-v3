import type { Route } from './+types/judgeGrades';
import { resolveAccess } from '~/lib/access.server';
import { handleGradeRequest } from '~/lib/gradeRequests.server';
import { confirmRound } from '~/lib/judging.server';

export async function action({ request, params: { linkId } }: Route.ActionArgs) {
  const link = await resolveAccess(request, linkId, 'JUDGE');
  if (!link?.apparatus) throw new Response(null, { status: 403 });
  const { competitionId, ground, apparatus } = link;

  return handleGradeRequest(
    request,
    competitionId,
    { kind: 'judge', ground, apparatus },
    ({ round, divisionIds }) =>
      confirmRound(competitionId, { ground, apparatus, round, divisionIds }),
  );
}
