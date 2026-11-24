import { data } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/lineupMoves';
import { contestContext } from '~/context';
import { actionError } from '~/lib/domainErrors.server';
import { DomainError } from '~/lib/errors';
import { getDivisionLineups, moveEntriesToLineup, unassignEntries } from '~/lib/lineups.server';
import { contestMiddleware, requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';

export const middleware: Route.MiddlewareFunction[] = [contestMiddleware];

const entry = z.array(z.string().min(1)).min(1);

const schema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('move'),
    entry,
    /** The apparatus it starts on. */
    lineup: z.string().min(1),
    before: z.string().optional(),
  }),
  z.object({ intent: z.literal('unassign'), entry }),
]);

/** Called by useLineupMoves. */
export async function action({ request, context, params }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const formData = await request.formData();
  const { data: values } = schema.safeParse({
    ...Object.fromEntries(formData),
    entry: [...new Set(formData.getAll('entry'))],
  });
  if (!values) return data({ error: t('common:errors.invalid') }, 400);

  try {
    const { division } = await getDivisionLineups(id, params.divisionId);
    if (division.contestId !== context.get(contestContext).id) throw new DomainError('NOT_FOUND');
    if (values.intent === 'unassign') {
      await unassignEntries(id, division.id, values.entry);
    } else {
      const lineup = { divisionId: division.id, apparatus: values.lineup };
      await moveEntriesToLineup(id, lineup, values.entry, values.before);
    }
    return data({ ok: true });
  } catch (error) {
    return actionError(error, t);
  }
}
