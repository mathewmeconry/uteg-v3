import type { Route } from './+types/athletes';
import { suggestAthletes } from '~/lib/athletes.server';
import { requireRole } from '~/middlewares/competition.server';

/**
 * Suggestions for the dialog that adds a starter, only for those who may add one. Called with POST
 * to keep names out of addresses and access logs.
 */
export async function action({ request, context }: Route.ActionArgs) {
  requireRole(context, 'EDITOR');
  const query = (await request.formData()).get('query');
  return { athletes: await suggestAthletes(String(query ?? '').slice(0, 200)) };
}
