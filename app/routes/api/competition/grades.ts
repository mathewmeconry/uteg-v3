import type { Route } from './+types/grades';
import { DomainError } from '~/lib/errors';
import { handleGradeRequest } from '~/lib/gradeRequests.server';
import { requireRole } from '~/middlewares/competition.server';

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');

  return handleGradeRequest(request, id, { kind: 'editor' }, async () => {
    // Needs a ground and an apparatus, see the grading page.
    throw new DomainError('INVALID_INPUT');
  });
}
