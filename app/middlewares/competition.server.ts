import { data, redirect, type MiddlewareFunction } from 'react-router';
import { competitionContext, contestContext, type Context } from '~/context';
import type { Role } from '~/generated/prisma/client';
import { getUser } from '~/lib/auth/auth.server';
import { getCompetitionForUser } from '~/lib/competitions.server';
import { getContest } from '~/lib/contests.server';
import { DomainError } from '~/lib/errors';
import { hasRole } from '~/lib/roles';

/**
 * Loads the competition of a member. Needs authMiddleware before it. The role may be CHECK_IN, see
 * the middlewares below.
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

/** Sends the check-in to the starters, the only page it may see. */
export const viewerPageMiddleware: MiddlewareFunction<Response> = ({ context }, next) => {
  const { id, role } = context.get(competitionContext);
  if (!hasRole(role, 'VIEWER')) throw redirect(`/competitions/${id}/starters`);
  return next();
};

/** Denies the check-in. */
export const viewerApiMiddleware: MiddlewareFunction<Response> = ({ context }, next) => {
  requireRole(context, 'VIEWER');
  return next();
};

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

/** First line of every action, and of loaders that not every member may call. */
export function requireRole(context: Context, minRole: Role) {
  const competition = context.get(competitionContext);
  if (!hasRole(competition.role, minRole)) throw data(null, 403);
  return competition;
}

/** For what editors and the check-in may do, but viewers may not. */
export function requireEditorOrCheckIn(context: Context) {
  const competition = context.get(competitionContext);
  return competition.role === 'CHECK_IN' ? competition : requireRole(context, 'EDITOR');
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
