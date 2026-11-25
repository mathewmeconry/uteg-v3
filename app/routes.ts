import { index, layout, prefix, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/index.ts'),
  // One address per language, for search engines.
  ...['de', 'fr', 'en'].map((code) => route(code, 'routes/landing.tsx', { id: `landing-${code}` })),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),

  layout('routes/auth/layout.tsx', [
    route('login', 'routes/auth/login.tsx'),
    route('register', 'routes/auth/register.tsx'),
    route('forgot-password', 'routes/auth/forgotPassword.tsx'),
    route('reset-password', 'routes/auth/resetPassword.tsx'),
  ]),
  route('verify-email', 'routes/auth/verifyEmail.ts'),
  route('logout', 'routes/auth/logout.ts'),

  layout('routes/secured/layout.tsx', [
    layout('routes/secured/home/layout.tsx', [
      route('home', 'routes/secured/home/index.tsx'),
      route('profile', 'routes/secured/home/profile.tsx'),
      route('competitions/new', 'routes/secured/home/newCompetition.tsx'),
      route('admin', 'routes/secured/admin/layout.tsx', [
        index('routes/secured/admin/users.tsx'),
        route('competitions', 'routes/secured/admin/competitions.tsx'),
      ]),
    ]),
    route('competitions/:competitionId', 'routes/secured/competition/layout.tsx', [
      // The only page for the check-in.
      route('starters', 'routes/secured/competition/starters.tsx'),
      layout('routes/secured/competition/viewerLayout.tsx', [
        index('routes/secured/competition/dashboard.tsx'),
        route('starters/import', 'routes/secured/competition/startersImport.tsx'),
        route('judges', 'routes/secured/competition/judges.tsx'),
        route('displays', 'routes/secured/competition/displays.tsx'),
        route('templates', 'routes/secured/competition/templates.tsx'),
        route('settings', 'routes/secured/competition/settings.tsx'),
        route('members', 'routes/secured/competition/members.tsx'),
        route('contests/:contestId', 'routes/secured/contest/layout.tsx', [
          route('divisions', 'routes/secured/contest/divisions.tsx'),
          route('divisions/proposal', 'routes/secured/contest/divisionProposal.tsx'),
          route('divisions/:divisionId', 'routes/secured/contest/division.tsx', [
            index('routes/secured/contest/divisionIndex.ts'),
            route('lineups', 'routes/secured/contest/lineups.tsx'),
            route('grading', 'routes/secured/contest/divisionGrading.tsx'),
          ]),
          route('grading', 'routes/secured/contest/grading.tsx'),
          route('ranking', 'routes/secured/contest/ranking.tsx'),
          route('settings', 'routes/secured/contest/settings.tsx'),
        ]),
      ]),
    ]),
  ]),

  // Access with a link instead of an account, see lib/access.server.ts.
  route('judge/:linkId', 'routes/judge.tsx'),
  route('display/:linkId', 'routes/display.tsx'),

  ...prefix('api', [
    route('auth/*', 'routes/api/auth.ts'),
    route('events/:competitionId', 'routes/api/events.ts'),
    route('language', 'routes/api/language.ts'),
    route('judge/:linkId/login', 'routes/api/judgeLogin.ts'),
    route('judge/:linkId/events', 'routes/api/judgeEvents.ts'),
    route('judge/:linkId/grades', 'routes/api/judgeGrades.ts'),
    route('display/:linkId/login', 'routes/api/displayLogin.ts'),
    route('display/:linkId/events', 'routes/api/displayEvents.ts'),
    route('assets/:assetId', 'routes/api/asset.ts'),
    route('competitions/:competitionId', 'routes/api/competition/layout.ts', [
      // What the starters page of the check-in needs.
      route('athletes', 'routes/api/competition/athletes.ts'),
      route('clubs', 'routes/api/competition/clubs.ts'),
      route('starters', 'routes/api/competition/starters.ts'),
      route('starters.xlsx', 'routes/api/competition/startersXlsx.ts'),
      route('pdf/starters', 'routes/api/competition/startersPdf.ts'),
      layout('routes/api/competition/viewerLayout.ts', [
        route('grades', 'routes/api/competition/grades.ts'),
        route('search', 'routes/api/competition/search.ts'),
        route('pdf/ranking', 'routes/api/competition/rankingPdf.ts'),
        route('pdf/judging-sheets', 'routes/api/competition/judgingSheetsPdf.ts'),
        route('pdf/judging-manual', 'routes/api/competition/judgingManualPdf.ts'),
        route(
          'contests/:contestId/divisions/:divisionId/lineup-moves',
          'routes/api/competition/lineupMoves.ts',
        ),
      ]),
    ]),
  ]),
  route('healthz', 'routes/healthz.ts'),
  route('*', 'routes/notFound.ts'),
] satisfies RouteConfig;
