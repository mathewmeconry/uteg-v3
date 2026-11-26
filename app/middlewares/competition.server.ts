import { data, redirect, type MiddlewareFunction } from 'react-router';
import { competitionContext, contestContext, type Context } from '~/context';
import { Role } from '~/generated/prisma/enums';
import { getUser } from '~/lib/auth/auth.server';
import { getCompetitionForUser } from '~/lib/competitions.server';
import { getContest } from '~/lib/contests.server';
import { DomainError } from '~/lib/errors';
import { hasRole } from '~/lib/roles';

/**
 * Loads the competition of a member. Needs authMiddleware before it. The role may be CHECK_IN or
 * GRADE_ENTRY, see the middlewares below.
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

/** Lets viewers and the given role see the pages below, and sends the others to their pages. */
function pageMiddleware(sideRole?: Role): MiddlewareFunction<Response> {
  return ({ context }, next) => {
    const { id, role, contests } = context.get(competitionContext);
    if (!hasRole(role, Role.VIEWER) && role !== sideRole) {
      throw redirect(
        role === Role.GRADE_ENTRY
          ? `/competitions/${id}/contests/${contests[0].id}/divisions`
          : `/competitions/${id}/starters`,
      );
    }
    return next();
  };
}

export const viewerPageMiddleware = pageMiddleware();
export const checkInPageMiddleware = pageMiddleware(Role.CHECK_IN);
export const gradeEntryPageMiddleware = pageMiddleware(Role.GRADE_ENTRY);

/** Denies the check-in and the grade entry. */
export const viewerApiMiddleware: MiddlewareFunction<Response> = ({ context }, next) => {
  requireRole(context, Role.VIEWER);
  return next();
};

export const gradeEntryApiMiddleware: MiddlewareFunction<Response> = ({ context }, next) => {
  requireRoleOr(context, Role.VIEWER, Role.GRADE_ENTRY);
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

/** For the members with at least `minRole`, and those with `sideRole`, which is beside the order. */
export function requireRoleOr(context: Context, minRole: Role, sideRole: Role) {
  const competition = context.get(competitionContext);
  return competition.role === sideRole ? competition : requireRole(context, minRole);
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
