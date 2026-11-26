import { data, redirect, type MiddlewareFunction } from 'react-router';
import { competitionContext, contestContext, type Context } from '~/context';
import { getUser } from '~/lib/auth/auth.server';
import { getCompetitionForUser } from '~/lib/competitions.server';
import { getContest } from '~/lib/contests.server';
import { DomainError } from '~/lib/errors';
import { can, type Permission } from '~/lib/roles';

/**
 * Loads the competition of any member. Needs authMiddleware before it. What the member may do is
 * checked below it, see pageMiddleware and requirePermission.
 */
export const competitionMiddleware: MiddlewareFunction<Response> = async (
  { params, context },
  next,
) => {
  const competition = await getCompetitionForUser(
    getUser(context).id,
    requireParam(params.competitionId),
  ).catch(notFound);
  context.set(competitionContext, competition);
  return next();
};

/**
 * Lets the members with one of the permissions see the pages below. The others go to the starters,
 * the only page of the check-in.
 */
export function pageMiddleware(...permissions: Permission[]): MiddlewareFunction<Response> {
  return ({ context }, next) => {
    const { id, role } = context.get(competitionContext);
    if (!permissions.some((permission) => can(role, permission))) {
      throw redirect(`/competitions/${id}/starters`);
    }
    return next();
  };
}

/** Answers the members without one of the permissions with 403. */
export function apiMiddleware(...permissions: Permission[]): MiddlewareFunction<Response> {
  return ({ context }, next) => {
    requirePermission(context, ...permissions);
    return next();
  };
}

/** Loads a contest of the competition. Needs competitionMiddleware before it. */
export const contestMiddleware: MiddlewareFunction<Response> = async (
  { params, context },
  next,
) => {
  const competition = context.get(competitionContext);
  const contest = await getContest(competition.id, requireParam(params.contestId)).catch(notFound);
  context.set(contestContext, contest);
  return next();
};

/**
 * First line of every action, and of loaders that not every member may call. Needs one of the
 * permissions.
 */
export function requirePermission(context: Context, ...permissions: Permission[]) {
  const competition = context.get(competitionContext);
  if (!permissions.some((permission) => can(competition.role, permission))) {
    throw data(null, 403);
  }
  return competition;
}

function requireParam(value: string | undefined): string {
  // Prisma ignores undefined filters and would return any record.
  if (!value) throw data(null, 404);
  return value;
}

function notFound(error: unknown): never {
  if (error instanceof DomainError && error.code === 'NOT_FOUND') throw data(null, 404);
  throw error;
}
