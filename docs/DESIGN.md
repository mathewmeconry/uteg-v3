# UTEG design

Users: volunteers in a gym office on competition day, judges on tablets, spectators at displays.
Confident, sporty, calm. The identity is the gym: hanging rings, chalk, petrol mats, and one signal
colour.

## Principles

1. **One thing to do.** Every page has at most one filled button, the next step.
2. **Dense data, generous actions.** Tables are tight, buttons and inputs are 40px, 44px on touch.
3. **Structure before boxes.** Titles, hairlines and space separate; a frame is for lists and tables.
   Never a box in a box.
4. **Quiet until it matters.** "Connected" is grey text, "connection lost" is a red badge.
5. **Never colour alone.** States have a word, and an icon or dot.
6. **Stable.** Nothing moves while typing or when live data arrives.

## Audit that led here (November 2026)

- System fonts without hierarchy; every group the same white card with border, shadow and padding.
- The competition's name up to three times per page, an empty top bar, half of the width unused.
- Sidebar sorted by kind instead of by the order of work; no way to switch the competition.
- Home: past and future mixed, no status, no next step. Empty dashboard: four zeros.
- Live view: boxes in boxes in boxes, a lonely fourth box, endless on phones.
- Ranking: 13 bordered buttons and five rows of controls before the first result; the selected
  category looked like the main action; empty categories looked like the others.
- Scoring: the save button below two screens of fields. Profile: three equal full-width buttons.
- A green "connected" pill on every page. Raw file inputs. Errors as plain red text.
- Dark theme: low contrast between page, cards and sidebar.

## Colour

Tokens in `app/app.css`, light and dark. Text meets 4.5:1, control borders and icons 3:1.

| Token | Use |
| --- | --- |
| `background`, `card`, `popover` | Page (chalk), lists and fields, what floats |
| `muted` | Table heads, empty states |
| `foreground`, `muted-foreground` | Text, secondary text |
| `primary` (petrol) | The main action, links, progress, selection |
| `accent` | Hover, the current row or step, date blocks |
| `ink` + `ink-*` (deep petrol) | Brand surfaces: top bar, competition switcher, sign-in, today's card |
| `brand` (lime) | Only for **now** and **best**: running, best grade, the action on ink, loading bar |
| `success`, `warning`, `destructive` | Done, needs attention, error or destructive |
| `gold`, `silver`, `bronze` | Medals |
| `border`, `input`, `ring` | Hairlines, control borders, focus |

No gradients, no purple, no tinted shadows.

## Type

Archivo variable (self-hosted, SIL OFL), one family in two cuts.

- `font-display`: narrow and heavy, for titles and the name of a competition.
- `figure`: narrow, bold, tabular, for grades, ranks and counts. Every table has tabular numerals.
- Text: 16px, 14px in forms and tables, 12px only for labels of figures.
- Page 28/32px, section 18px, card title 18–20px. Sentence case, never all caps.
- Weights: 400 text, 600 names, labels and buttons. Regular for hints and checkbox labels.

## Space, radius, elevation

- 4px grid: 8 label–field, 20 between fields, 28 between sections, 16/32 page padding.
- Radius 6 controls, 8 items, 10 lists and dialogs. Round only for avatars, dots and step numbers.
- Elevation: page < card (hairline, no shadow) < popover, dialog, floating bar (shadow).

## Page anatomy

- **Shell**: sidebar with the competition switcher, then the work in order (Vorbereitung, Wettkampf,
  Auswertung, Verwaltung), account at the bottom. Phones: ink bar with menu, name, account.
- **`PageHeader`**: breadcrumbs (sub pages only), title, `status` (connection, state), description,
  actions on the right with the main one last.
- **`Toolbar`**: filters and settings of the list below.
- **Content** at most 90rem wide; forms and settings at most 64rem (`Sections`), home 64rem.

## Components

- **Table** (`ui/table`): in `overflow-hidden rounded-xl border bg-card`. Numbers right-aligned.
  Below `md` a list with the same data (`RankingList`).
- **List**: `divide-y rounded-xl border bg-card`. The whole row is the link if it opens something.
- **`Stats` / `StatTile`**: counts in one frame, not one card each.
- **Form**: `Section` (title and explanation left, fields right) with hairlines between. Two columns
  at most, short values get short fields. Long forms end with `FormActions` (sticky).
- **Dialog**: for one decision or a short form. Title is the question, the button repeats the verb.
  Destructive pages show an outlined red button, the filled red one is in the dialog.
- **`EmptyState`**: what is missing, why, and the one next step.
- **`StatusBadge`**: `neutral` planned, `live` running, `done`, `warning`, `danger`.
  `DivisionStateBadge` uses it.
- **`SaveStatus`**: `idle`, `saving`, `saved`, `error` with retry, for forms that save by themselves.
  In `PageHeader status` or next to the field. No toast on top of it.
- **Toast**: result of an action whose effect is not visible where one looks.
- **Alert**: `warning` and `destructive`, above what it is about.
- **Choice** (few options that change the view): segmented links like in the ranking, options
  without content are regular and grey.
- **`RoundMeter`**: progress of a division, one segment per round.
- **Loading**: the lime bar under the top edge, after 150ms. `Skeleton` only for parts loaded later.
- **Motion**: 150–200ms colour and opacity only; `prefers-reduced-motion` switches everything off.

## Texts

German in Swiss spelling, neutral or "du". Short, verb first on buttons ("Abteilung starten", not
"OK"). Say what happened and what to do. No exclamation marks, no internal words (Entry, Link-ID).

## Do / don't

- Do lead with the name or grade, put the rest in muted text. Don't give every fact a badge.
- Do show what is due next. Don't show zeros.
- Do keep one filled button. Don't use `primary` for selected filters next to it, use `ink`.
- Do use `brand` for now and best. Don't use it as decoration or text on light surfaces.
