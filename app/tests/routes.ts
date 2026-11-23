import { RouterContextProvider } from 'react-router';
import { userContext } from '~/context';
import type { Role } from '~/generated/prisma/client';
import { competitionMiddleware, contestMiddleware } from '~/middlewares/competition.server';
import { addMember, createUser } from './helpers';

/** A loader or action. Their argument types differ per route. */
type Handler = (args: any) => unknown;

/**
 * Calls a loader or action below a competition as a member, behind the middlewares of its layouts.
 * Without a role the user is no member. Thrown responses are returned.
 */
export async function callRoute(
  handler: Handler,
  {
    competitionId,
    contestId,
    role,
    search = '',
    form,
    text,
  }: {
    competitionId: string;
    contestId?: string;
    role?: Role;
    search?: string;
    form?: [string, string][];
    /** Sent instead of a form. */
    text?: string;
  },
): Promise<any> {
  const user = await createUser();
  if (role) await addMember(competitionId, user.id, role);
  const context = new RouterContextProvider();
  context.set(userContext, user as any);

  const body = new FormData();
  for (const [name, value] of form ?? []) body.append(name, value);
  const request = new Request(
    `http://localhost/${search}`,
    form || text ? { method: 'POST', body: text ?? body } : undefined,
  );
  const params = { competitionId, contestId };
  const args = { request, params, context } as any;

  try {
    await competitionMiddleware(args, async () => new Response());
    if (contestId) await contestMiddleware(args, async () => new Response());
    return await handler(args);
  } catch (error) {
    const status = (error as { init?: { status?: number } }).init?.status;
    if (status) return new Response(null, { status });
    if (error instanceof Response) return error;
    throw error;
  }
}
