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
  const toasts = () => context.get(toastContext);
  try {
    const result: any = await action({ request, context, params });
    return { status: result?.init?.status ?? 200, error: result?.data?.error, toasts: toasts() };
  } catch (error) {
    // Thrown ones replace the page.
    return { status: statusOfThrown(error), thrown: true, toasts: toasts() };
  }
}

/** The status of what a loader returns or throws. */
export async function statusOf(run: () => Promise<unknown>) {
  try {
    await run();
    return 200;
  } catch (error) {
    return statusOfThrown(error);
  }
}

function statusOfThrown(error: unknown) {
  const status = (error as { init?: { status?: number } }).init?.status;
  if (status === undefined) throw error;
  return status;
}
