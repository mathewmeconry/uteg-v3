import type { Route } from './+types/judgeGrades';
import { resolveAccess } from '~/lib/access.server';
import { handleGradeRequest } from '~/lib/gradeRequests.server';
import { confirmRound, saveGrades, type GradeScope } from '~/lib/judging.server';

export async function action({ request, params: { linkId } }: Route.ActionArgs) {
  const link = await resolveAccess(request, linkId, 'JUDGE');
  if (!link?.apparatus) throw new Response(null, { status: 403 });
  const { competitionId, ground, apparatus: own } = link;

  return handleGradeRequest(request, async (body) => {
    if (body.intent === 'confirm') {
      const { round, divisionIds } = body;
      return confirmRound(competitionId, { ground, apparatus: own, round, divisionIds });
    }
    const { entryId, apparatus, grade, previous } = body;
    const scope: GradeScope = { kind: 'judge', ground, apparatus: own };
    return saveGrades(competitionId, [{ entryId, apparatus, ...grade, previous }], scope);
  });
}
