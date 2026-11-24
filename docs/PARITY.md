# Feature parity with uteg-v2

Status: `[ ]` open, `[x]` done and verified, `[-]` deliberately dropped (reason given).
Paths in brackets point into `uteg-v2/frontend/src` unless prefixed `BE:` (`uteg-v2/backend/src`).

## Auth, shell

- [ ] P-01 Login, register (email, password, repeated), logout
- [ ] P-02 Profile: email, language, **change password** (empty tab in v2)
- [ ] P-03 de/en, detected from the browser, user preference wins; Swiss spelling, dates in locale
- [ ] P-04 Competition layout: bar at the top, tabs at the bottom on small screens
- [ ] P-05 404 and error pages (missing in v2)

## Competitions

- [x] P-10 Home: competitions I am a member of
- [x] P-11 Create wizard: general + logo, grounds + modules, module settings (honour %), **members** ("TODO" in v2), review
- [x] P-12 Dashboard: starters, clubs, grades, **live results and progress per ground and apparatus**
- [x] P-13 Settings: name, location, dates (not saved in v2), grounds, logo upload/delete
- [x] P-14 **Contest settings**: honour %, quota rounding, precision, tie-break, vault inputs per category
- [x] P-15 **Members**: add by email, invite addresses without an account, role owner/editor/viewer/check-in, remove
- [x] P-16 **Delete competition**

## Starters

- [ ] P-20 Table: first name, last name, sex, birth year, club, location, category, division, start apparatus; sort, search, multi-select filters, column visibility
- [ ] P-21 Row selection, bulk assign to division + start apparatus (grouped by category and sex), bulk remove
- [ ] P-22 Create with suggestions on STV-ID and names, club picker that can create a club
- [ ] P-23 Edit including category, division, start apparatus; **"also update athlete"** (off by default), differences from the athlete are marked
- [ ] P-24 Remove (soft) and restore by adding again; duplicates (names case-insensitive + birth year + sex, or STV-ID) reuse the existing starter
- [ ] P-25 Excel export of filtered rows, PDF export grouped by club (P-72)
- [ ] P-26 Excel import: club choice, several files, all sheets, header synonyms, value normalisation, editable review with swap names, invalid divisions ignored, result with failures; **template download** (not linked in v2)
      [pages/competition/[id]/starters/import/**, modules/egt/handlers/parseStarterFromSheet]

## Divisions and lineups

- [ ] P-30 List, live: number, category, sex, ground, state with round, starter count; filter, **running order** per ground instead of sorting
- [ ] P-31 Create (auto number per category and sex, one lineup per apparatus), **edit ground**, delete (renumbers)
- [ ] P-32 Start, stop, single and bulk with confirmation; start resets progress
- [ ] P-33 Lineups: unassigned + one list per apparatus, bulk assign; **ordering and drag and drop** (no order in v2)
- [ ] P-34 Judging sheets for selected divisions or all running on a ground

## Judging

- [ ] P-40 Judge links: one per ground and apparatus, QR, copy, reset, reset all, manual PDFs
- [ ] P-41 Tablet: token login, ground/apparatus header, font size A+/A-, waits for a division and shows it as soon as it starts
- [ ] P-42 One starter at a time: name, club, category, grade; progress; back/next; every grade saved on next
- [ ] P-43 Comma accepted, 0–10, vault attempts with computed final grade, direct final entry
- [ ] P-44 Review of the round, edit, confirm → next round's rotated list immediately
- [ ] P-45 Pause round (empty list), finished screen, then back to waiting for the next division
- [ ] P-46 Future rounds: all rounds of this apparatus with the current starter marked
- [ ] P-47 Live list: added/removed starters with a notice, removed ones struck through
- [ ] P-48 Resume after reload; unsaved input survives a reload and a lost connection
- [ ] P-49 Grading by ground in the admin area (a list per apparatus in starting order, one choice of round)
- [ ] P-50 Grading of one division in any state (corrections after the end)

## Displays

- [ ] P-55 Manage displays per ground: create, QR, copy, reset, delete
- [ ] P-56 Display screen: per apparatus last graded starter with grade and next starter; round; font size
- [ ] P-57 30 s delay on round change, content stays 5 min after the last division ended

## Ranking

- [ ] P-60 Per sex and category, best grade per apparatus highlighted, medals and honour
- [ ] P-61 Warning when divisions are running; **provisional ranking**; live
- [ ] P-62 Honour % editable next to the ranking
- [ ] P-63 **Ranking PDF customisation** with preview: title, subtitle, footer, logos, colour, orientation, columns, decimals, medal style, page numbers, signature line, group headings, saved per competition
- [ ] P-64 **Cover page** of a ranking PDF: PDF or image per template, once or before every category; templates are assigned to categories

## PDFs

- [ ] P-70 Ranking (one category, or several in one file)
- [ ] P-71 Judging sheets: one page per apparatus and round, vault columns, Pause pages
- [ ] P-72 Starter list grouped by club
- [ ] P-73 Judging manual with QR, one page per apparatus

## Extensibility

- [ ] P-80 Second contest in the same competition with its own entries and grades, seeded from a ranking: proven by a test, not shipped as a feature
