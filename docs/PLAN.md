# UTEG v3 – implementation plan

Rebuild of uteg-v2 (NestJS/GraphQL/TypeORM/MariaDB + MUI) as one React Router app.
Feature status lives in [PARITY.md](./PARITY.md).

## Stack

React Router 8 (framework mode, SSR), Vite, TypeScript, Prisma 7 + PostgreSQL, Tailwind 4, shadcn, lucide, better-auth, i18next (de/en), @react-pdf/renderer, Vitest, Playwright.

## Key decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Realtime | Server-Sent Events from an in-process event bus. Events carry no data, the client re-runs its loader. | Only one code path computes data, no extra service. The app runs as one process. |
| Extensibility | A `Competition` has `Contest`s. Each contest names a module (`egt`, later `championship`) and owns its entries, divisions and grades. | A championship is "some athletes compete again": a second contest with its own grades, seeded from the first one's ranking. No schema change. |
| Module code | `app/modules/<key>` implements `ContestModule` and is listed in `app/modules/registry.ts`. | Replaces v2's frontend/backend hook system. |
| Athletes | `Athlete` is the shared master record: name, birth year, sex, optional unique STV-ID. A `Starter` belongs to one competition, points to its athlete and stores the values used there, plus the club. Editing a starter updates the athlete only on request. Suggestions search all athletes. | In v2 editing an athlete changed every competition, including finished rankings. |
| Judge/display access | The link is `/judge/<linkId>#<token>`. The page exchanges the token for an httpOnly cookie per link, which is compared with the database on every request. | The secret is in no URL the server sees, so in no log. Resetting a link locks the old tablet out at once (v2 JWTs stayed valid). |
| Progress | One `DivisionApparatus` row per division and apparatus, updated atomically. | v2 lost updates when two devices finished at the same time. |
| Lineups | An entry stores the apparatus it starts on, with a foreign key to the `DivisionApparatus`. A lineup is not a table. | Nobody can start on an apparatus their division does not have. |
| Grades | Unique per entry and apparatus. Vault attempts are stored, the server computes the final grade. Integer thousandths in the domain code. | v2 could create duplicates and only kept the final value. |
| PDFs | Rendered on the server with bundled fonts. | v2 loaded fonts from Google at print time. |
| Uploads | Logos (PNG/JPEG, max 5 MB) are stored in the database. | No volume to manage. |

## Domain rules

- Apparatus rotate Reck → Boden → Schaukelringe → Sprung → Barren (men only) → Reck.
  Rounds = number of apparatus of the sex (men 5, women 4).
- A lineup starting on apparatus `s` is on `(s + round) % n` in round `round` (0-based).
- All running divisions on a ground are merged per apparatus. The merged list is rotated left by
  `round % length`: whoever started first goes last on the next apparatus.
- A division only appears on apparatus it has (v2 listed women on Barren on mixed grounds).
- An entry withdrawn while its division runs keeps its slot, struck through. Withdrawn before the
  start it disappears.
- Each apparatus confirms each round, including empty ones ("Pause"). A division's round is the
  lowest confirmed count; when every apparatus confirmed all rounds it is ENDED. That last
  confirmation needs the grades of everyone in a lineup on every apparatus.
- Starting a division resets its progress. Grades are kept.
- Sprung: two attempts, best counts; K6/K7 the average. Zero is a valid attempt.
  Attempts have two decimals, final grades up to three. The average of two attempts is therefore
  exact in thousandths and only rounded for the ranking.
- An STV-ID only matches its owner if sex, first name and either birth year or last name are the
  same. Otherwise it is an error, unless the athlete was picked.
- Ranking: only ENDED divisions (running ones on request as provisional). Missing grade = 0.
  Same total shares the rank, the next rank is skipped. The tie-break only orders the list.
  Ranks 1–3 get medals, then `rank <= round(n * percent)` gets an Auszeichnung (medals count).

Configurable per contest because the STV Weisungen leave it to the event: Auszeichnung percentage
per category and sex, quota rounding (`round` as in v2, `ceil` as at the SM), grade precision
(2 decimals as in v2, 3 as at the SM), and the tie-break order
(default Boden, Schaukelringe, Sprung, Barren, Reck).

## Structure

```
app/
  components/        feature components, ui/ = shadcn
  lib/               <domain>.server.ts services, pure helpers, tests next to the code
  modules/           contest modules (egt), registry, shared types
  pdf/               react-pdf documents
  locales/{de,fr,en}/
  middlewares/       auth, competition access, i18n
  routes/            auth, secured, judge, display, api
prisma/  docs/  e2e/
```

## Phases

1. Scaffold, schema, module contract → typecheck and lint pass
2. Pure domain code, test first: rotation, progress, scoring, ranking, import parsing
3. Server services and realtime, tested against real Postgres
4. UI: admin, judging tablet, displays, rankings, PDFs
5. Integration, Playwright end-to-end over a full competition, feature parity audit, code review
