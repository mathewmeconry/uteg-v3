# AGENTS.md

Guide for coding agents working on UTEG.

## Product

UTEG runs Swiss Geräteturnen competitions: organisers manage starters, divisions and lineups, judges
enter grades on a tablet at their apparatus, displays show the latest grades, and rankings and lists
are printed. Rewrite of uteg-v2. The domain rules and decisions are in `docs/PLAN.md`, the feature
status in `docs/PARITY.md`.

## Stack

- React Router 8 (framework mode, SSR), Vite 8, React 19, TypeScript
- Prisma 7 with PostgreSQL, better-auth (email and password, email-otp plugin for codes), mails with Resend and MJML
- Tailwind 4, shadcn (new-york, in `app/components/ui`), lucide, sonner
- i18next (de, en), zod 4, pino, @react-pdf/renderer, exceljs, dnd-kit
- vitest + Testing Library, Playwright
- pnpm only, Node >= 24. One process: live updates and rate limits are in memory.

## Code map

- `app/routes.ts` all routes. `routes/secured/competition` and `routes/secured/contest` are the
  admin pages, `routes/judge.tsx` and `routes/display.tsx` the pages opened with a link
  (`accessUrl`, `resolveAccess`, `AccessGate`), `routes/api` resource routes.
- `app/context.ts` what middlewares pass to loaders and actions.
- `app/middlewares/` session and login, competition and contest access, roles, Origin check,
  security headers, language, toasts.
- `app/lib/*.server.ts` services, the only place with database access besides auth.
  `app/lib/domain/` pure rules (rotation, progress, grades, ranking, import).
- `app/modules/` contest modules.
- `app/components/` shared components, `app/hooks/`, `app/locales/{de,en}/<namespace>.ts`.
- `app/tests/` test database and helpers.

## Writing a route

```tsx
export async function loader({ context, params }: Route.LoaderArgs) {
  const { id } = context.get(competitionContext); // contestContext below contests/:contestId
  return { members: await listMembers(id) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'OWNER'); // first line of every action
  const t = getT(context);
  const { data: values, errors } = parseForm(await request.formData(), schema);
  if (errors) return data({ errors }, 400);
  try {
    await addMember(id, values);
  } catch (error) {
    return data({ errors: { email: domainErrorMessage(error, t) } }, 400);
  }
  enqueueToast(context, { type: 'success', message: t('settings:memberAdded') });
  return redirect('.');
}
```

- Access is checked by the middlewares of the layouts. Pass ids from the context, not from
  `params`, and check that nested ids (division, starter) belong to them: services take the
  competition or contest id first.
- Layouts need a loader, otherwise client navigations skip their middleware.
- Forms: `FormField`, `SubmitButton`, `ConfirmDialog`. Several forms on a page send `intent`.
- `useCompetition()` gives the competition, contests, `role`, `canEdit` and `isOwner` to components.
- Live pages call `useLiveUpdates('/api/events/<id>')` (judges `/api/judge/<linkId>/events`, displays
  `/api/display/<linkId>/events`) and show `<ConnectionBadge status={…} />`. Services call `publish`.
- Title: `<title>{`${t('title')} · UTEG`}</title>` in the component.

## Texts

- Every text is in a locale file. German is the source, `en` has `satisfies Translation<typeof de>`,
  so missing keys fail the typecheck. Keys of `common` need no prefix: `t('actions.save')`,
  others `useTranslation('starters')` or `t('starters:title')`.
- Never call the global i18next: components use `useTranslation`, the server `getT(context)`.
- German in Swiss spelling (ss, never ß), neutral or "du".
- Dates and numbers must format the same on the server and in the browser (explicit locale and time
  zone, see `lib/format.ts`).

## Conventions

- Path alias `~/*` is `app/*`. `import type` for type-only imports. Server-only code is in
  `*.server.ts`.
- Prefer `function` declarations. Default-export page components.
- Validate inputs with zod `safeParse`. Errors users can cause are `DomainError`s.
- Pages follow `docs/DESIGN.md`. Colours only through the tokens in `app.css`, which also define the dark theme (follows the
  system unless chosen). Touch targets are at least 44px on touch devices, set in `app.css`.
- Comments explain why, not what. No `console.log`; don't log tokens or names.
- Tests sit next to the code: `*.test.ts` runs in node, `*.test.tsx` in jsdom. Services are tested
  against the real test database. `TEST_DB_NAME=uteg_test_x` gives a parallel run its own.
- Commits follow Conventional Commits in plain language.

## Agent rules

- Clean, workable code; no slop and no overengineering. Stay in scope: no unrequested abstractions
  or dependencies.
- When an idea is dropped, remove it completely (code, UI text, docs).
- Edit files with the edit tools, not with sed or scripts. `app/components/ui` may be updated with
  the shadcn CLI.
- Before finishing, run: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test:ci`,
  `pnpm knip`.
