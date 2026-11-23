import { RouterContextProvider } from 'react-router';
import { competitionContext, contestContext, toastContext } from '~/context';
import type { Role } from '~/generated/prisma/client';
import { getCompetitionForUser } from '~/lib/competitions.server';
import { getContest } from '~/lib/contests.server';
import { addMember, createUser } from './helpers';

/** What the middlewares pass to loaders and actions below a contest, for a new member. */
export async function contextFor(competition: { id: string; contest: { id: string } }, role: Role) {
  const user = await createUser();
  await addMember(competition.id, user.id, role);
  const context = new RouterContextProvider();
  context.set(competitionContext, await getCompetitionForUser(user.id, competition.id));
  context.set(contestContext, await getContest(competition.id, competition.contest.id));
  return context;
}

/** Calls an action with form fields. An array is sent as repeated fields. */
export async function callAction(
  action: (args: any) => unknown,
  context: RouterContextProvider,
  fields: Record<string, string | string[]>,
  params: Record<string, string> = {},
) {
  const body = new URLSearchParams(
    Object.entries(fields).flatMap(([name, value]) => [value].flat().map((item) => [name, item])),
  );
  const request = new Request('http://localhost/', { method: 'POST', body });
  const status = await statusOf(async () => action({ request, context, params }));
  return { status, toasts: context.get(toastContext) };
}

/** The status of what a loader or action returns or throws. */
export async function statusOf(run: () => Promise<unknown>) {
  try {
    const result = await run();
    return (result as { init?: { status?: number } } | null)?.init?.status ?? 200;
  } catch (error) {
    const status = (error as { init?: { status?: number } }).init?.status;
    if (status === undefined) throw error;
    return status;
  }
}
