import type { Route } from './+types/grades';
import { DomainError } from '~/lib/errors';
import { handleGradeRequest } from '~/lib/gradeRequests.server';
import { saveGrades } from '~/lib/judging.server';
import { requireRole } from '~/middlewares/competition.server';

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');

  return handleGradeRequest(request, async (body) => {
    // Needs a ground and an apparatus, see the grading page.
    if (body.intent === 'confirm') throw new DomainError('INVALID_INPUT');
    const { entryId, apparatus, grade, previous } = body;
    return saveGrades(id, [{ entryId, apparatus, ...grade, previous }], { kind: 'editor' });
  });
}
