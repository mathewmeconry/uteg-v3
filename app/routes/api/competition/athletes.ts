import type { Route } from './+types/athletes';
import { suggestAthletes } from '~/lib/athletes.server';
import { rejectNul } from '~/lib/forms.server';
import { Role } from '~/generated/prisma/enums';
import { requireRoleOr } from '~/middlewares/competition.server';

/**
 * Suggestions for the dialog that adds a starter, only for those who may add one. Called with POST
 * to keep names out of addresses and access logs.
 */
export async function action({ request, context }: Route.ActionArgs) {
  requireRoleOr(context, Role.EDITOR, Role.CHECK_IN);
  const formData = await request.formData();
  rejectNul(formData);
  const query = formData.get('query');
  return { athletes: await suggestAthletes(String(query ?? '').slice(0, 200)) };
}
