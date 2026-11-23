import { data } from 'react-router';
import type { Route } from './+types/athletes';
import { suggestAthletes } from '~/lib/athletes.server';
import { hasNul } from '~/lib/safeText';
import { requireRole } from '~/middlewares/competition.server';

/**
 * Suggestions for the dialog that adds a starter, only for those who may add one. Called with POST
 * to keep names out of addresses and access logs.
 */
export async function action({ request, context }: Route.ActionArgs) {
  requireRole(context, 'EDITOR');
  const formData = await request.formData();
  if (hasNul(formData)) return data({ athletes: [] }, 400);
  const query = formData.get('query');
  return { athletes: await suggestAthletes(String(query ?? '').slice(0, 200)) };
}
