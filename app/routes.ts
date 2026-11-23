import { index, layout, prefix, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/index.ts'),

  layout('routes/auth/layout.tsx', [
    route('login', 'routes/auth/login.tsx'),
    route('register', 'routes/auth/register.tsx'),
  ]),
  route('logout', 'routes/auth/logout.ts'),

  layout('routes/secured/layout.tsx', [
    layout('routes/secured/home/layout.tsx', [
      route('home', 'routes/secured/home/index.tsx'),
      route('profile', 'routes/secured/home/profile.tsx'),
      route('competitions/new', 'routes/secured/home/newCompetition.tsx'),
    ]),
    route('competitions/:competitionId', 'routes/secured/competition/layout.tsx', [
      index('routes/secured/competition/dashboard.tsx'),
      route('starters', 'routes/secured/competition/starters.tsx'),
      route('starters/import', 'routes/secured/competition/startersImport.tsx'),
      route('judges', 'routes/secured/competition/judges.tsx'),
      route('displays', 'routes/secured/competition/displays.tsx'),
      route('templates', 'routes/secured/competition/templates.tsx'),
      route('settings', 'routes/secured/competition/settings.tsx'),
      route('members', 'routes/secured/competition/members.tsx'),
      route('contests/:contestId', 'routes/secured/contest/layout.tsx', [
        route('divisions', 'routes/secured/contest/divisions.tsx'),
        route('divisions/:divisionId/lineups', 'routes/secured/contest/lineups.tsx'),
        route('divisions/:divisionId/grading', 'routes/secured/contest/divisionGrading.tsx'),
        route('grading', 'routes/secured/contest/grading.tsx'),
        route('ranking', 'routes/secured/contest/ranking.tsx'),
        route('settings', 'routes/secured/contest/settings.tsx'),
      ]),
    ]),
  ]),

  // Access with a token instead of an account.
  route('judge/:token', 'routes/judge.tsx'),
  route('display/:token', 'routes/display.tsx'),

  ...prefix('api', [
    route('auth/*', 'routes/api/auth.ts'),
    route('events/:competitionId', 'routes/api/events.ts'),
    route('judge/:token/events', 'routes/api/judgeEvents.ts'),
    route('display/:token/events', 'routes/api/displayEvents.ts'),
    route('assets/:assetId', 'routes/api/asset.ts'),
    route('competitions/:competitionId', 'routes/api/competition/layout.ts', [
      route('starters.xlsx', 'routes/api/competition/startersXlsx.ts'),
      route('pdf/ranking', 'routes/api/competition/rankingPdf.ts'),
      route('pdf/starters', 'routes/api/competition/startersPdf.ts'),
      route('pdf/judging-sheets', 'routes/api/competition/judgingSheetsPdf.ts'),
      route('pdf/judging-manual', 'routes/api/competition/judgingManualPdf.ts'),
      route(
        'contests/:contestId/divisions/:divisionId/lineup-moves',
        'routes/api/competition/lineupMoves.ts',
      ),
    ]),
  ]),
  route('healthz', 'routes/healthz.ts'),
  route('*', 'routes/notFound.ts'),
] satisfies RouteConfig;
