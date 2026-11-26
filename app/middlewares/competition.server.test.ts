import { RouterContextProvider, UNSAFE_ErrorResponseImpl } from 'react-router';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import routes from '~/routes';
import { competitionContext, contestContext, userContext } from '~/context';
import type { Role } from '~/generated/prisma/client';
import { addMember, createCompetition, createUser, truncateTables } from '~/tests/helpers';
import { authMiddleware } from './auth.server';
import {
  checkInPageMiddleware,
  competitionMiddleware,
  contestMiddleware,
  gradeEntryApiMiddleware,
  gradeEntryPageMiddleware,
  requireRole,
  viewerApiMiddleware,
  viewerPageMiddleware,
} from './competition.server';

beforeEach(truncateTables);

function contextFor(user: { id: string } | null) {
  const context = new RouterContextProvider();
  context.set(userContext, user as any);
  return context;
}

async function run(
  middleware: any,
  context: RouterContextProvider,
  params: Record<string, string | undefined> = {},
  request = new Request('http://localhost/competitions/c?a=1'),
) {
  const next = vi.fn(async () => new Response('ok'));
  try {
    await middleware({ request, params, context }, next);
    return { status: 200, next };
  } catch (error) {
    return { status: statusOf(error), next, error };
  }
}

/** data(null, status) is thrown as an object with init, redirects as a Response. */
function statusOf(error: any): number | undefined {
  if (error instanceof UNSAFE_ErrorResponseImpl || error instanceof Response) return error.status;
  return error?.init?.status;
}

async function setup(role: Role) {
  const competition = await createCompetition();
  const user = await createUser();
  await addMember(competition.id, user.id, role);
  return { competition, context: contextFor(user) };
}

describe('authMiddleware', () => {
  it('lets signed-in users through', async () => {
    const { status } = await run(authMiddleware, contextFor({ id: '1' }));
    expect(status).toBe(200);
  });

  it('sends others to the login page and back afterwards', async () => {
    const { status, next, error } = await run(authMiddleware, contextFor(null));
    expect(status).toBe(302);
    expect((error as Response).headers.get('Location')).toBe(
      '/login?redirectTo=%2Fcompetitions%2Fc%3Fa%3D1',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('sends them back to the page, not to its data', async () => {
    const request = new Request('http://localhost/competitions/c.data?a=1&_routes=x');
    const { error } = await run(authMiddleware, contextFor(null), {}, request);
    expect((error as Response).headers.get('Location')).toBe(
      '/login?redirectTo=%2Fcompetitions%2Fc%3Fa%3D1',
    );
  });

  it('answers event streams with 401', async () => {
    const request = new Request('http://localhost/api/events/c', {
      headers: { Accept: 'text/event-stream' },
    });
    expect((await run(authMiddleware, contextFor(null), {}, request)).status).toBe(401);
  });
});

describe('competitionMiddleware', () => {
  it.each(['VIEWER', 'EDITOR', 'OWNER'] as const)('lets a %s through', async (role) => {
    const { competition, context } = await setup(role);
    const { status } = await run(competitionMiddleware, context, {
      competitionId: competition.id,
    });
    expect(status).toBe(200);
    expect(context.get(competitionContext)).toMatchObject({ id: competition.id, role });
  });

  it('hides the competition from members of other competitions', async () => {
    const { context } = await setup('OWNER');
    const other = await createCompetition();
    const { status, next } = await run(competitionMiddleware, context, {
      competitionId: other.id,
    });
    expect(status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, 'unknown'])('answers id %j with 404', async (competitionId) => {
    const { context } = await setup('OWNER');
    expect((await run(competitionMiddleware, context, { competitionId })).status).toBe(404);
  });
});

describe('role middlewares', () => {
  it.each([
    ['CHECK_IN', 302, 403],
    ['GRADE_ENTRY', 302, 403],
    ['VIEWER', 200, 200],
  ] as const)('answer a %s with %i on pages and %i in the API', async (role, page, api) => {
    const { competition, context } = await setup(role);
    await run(competitionMiddleware, context, { competitionId: competition.id });
    expect((await run(viewerPageMiddleware, context)).status).toBe(page);
    expect((await run(viewerApiMiddleware, context)).status).toBe(api);
  });

  it.each([
    ['CHECK_IN', 200, 302, 403],
    ['GRADE_ENTRY', 302, 200, 200],
    ['VIEWER', 200, 200, 200],
  ] as const)(
    'answer a %s with %i on the starters, %i on the grading pages and %i in their API',
    async (role, starters, grading, api) => {
      const { competition, context } = await setup(role);
      await run(competitionMiddleware, context, { competitionId: competition.id });
      expect((await run(checkInPageMiddleware, context)).status).toBe(starters);
      expect((await run(gradeEntryPageMiddleware, context)).status).toBe(grading);
      expect((await run(gradeEntryApiMiddleware, context)).status).toBe(api);
    },
  );

  it('send the grade entry to the divisions', async () => {
    const { competition, context } = await setup('GRADE_ENTRY');
    await run(competitionMiddleware, context, { competitionId: competition.id });
    const { error } = await run(viewerPageMiddleware, context);
    expect((error as Response).headers.get('Location')).toBe(
      `/competitions/${competition.id}/contests/${competition.contest.id}/divisions`,
    );
  });

  it('are around everything but the starters and the grading', () => {
    const all = (routes as RouteConfigEntry[]).flatMap((entry) => [
      entry,
      ...(entry.children ?? []),
    ]);
    const api = all.find(({ file }) => file === 'routes/api/competition/layout.ts')!;
    expect(api.children!.map(({ file }) => file)).toEqual([
      'routes/api/competition/athletes.ts',
      'routes/api/competition/clubs.ts',
      'routes/api/competition/starters.ts',
      'routes/api/competition/startersXlsx.ts',
      'routes/api/competition/startersPdf.ts',
      'routes/api/competition/gradeEntryLayout.ts',
      'routes/api/competition/viewerLayout.ts',
    ]);
    const { children } = all.find(({ file }) => file === 'routes/secured/competition/layout.tsx')!;
    expect(children!.map(({ file }) => file)).toEqual([
      'routes/secured/competition/starters.tsx',
      'routes/secured/competition/viewerLayout.tsx',
      'routes/secured/contest/layout.tsx',
    ]);
    const contest = children!.find(({ file }) => file === 'routes/secured/contest/layout.tsx')!;
    expect(contest.children!.map(({ file }) => file)).toEqual([
      'routes/secured/contest/divisions.tsx',
      'routes/secured/contest/division.tsx',
      'routes/secured/contest/grading.tsx',
      'routes/secured/competition/viewerLayout.tsx',
    ]);
  });
});

describe('contestMiddleware', () => {
  it('loads a contest of the competition with its module', async () => {
    const { competition, context } = await setup('VIEWER');
    await run(competitionMiddleware, context, { competitionId: competition.id });
    const { status } = await run(contestMiddleware, context, { contestId: competition.contest.id });
    expect(status).toBe(200);
    expect(context.get(contestContext).module.key).toBe('egt');
  });

  it('answers contests of other competitions with 404', async () => {
    const { competition, context } = await setup('OWNER');
    const other = await createCompetition();
    await run(competitionMiddleware, context, { competitionId: competition.id });
    const { status } = await run(contestMiddleware, context, { contestId: other.contest.id });
    expect(status).toBe(404);
  });
});

describe('requireRole', () => {
  it.each([
    ['OWNER', 'OWNER', true],
    ['OWNER', 'VIEWER', true],
    ['EDITOR', 'EDITOR', true],
    ['EDITOR', 'OWNER', false],
    ['VIEWER', 'VIEWER', true],
    ['VIEWER', 'EDITOR', false],
  ] as const)('%s acting as %s: %s', async (role, minRole, allowed) => {
    const { competition, context } = await setup(role);
    await run(competitionMiddleware, context, { competitionId: competition.id });
    let status = 200;
    try {
      expect(requireRole(context, minRole).id).toBe(competition.id);
    } catch (error) {
      status = statusOf(error) ?? 0;
    }
    expect(status).toBe(allowed ? 200 : 403);
  });
});
