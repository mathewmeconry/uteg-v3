import { createElement } from 'react';
import { data } from 'react-router';
import type { Route } from './+types/startersPdf';
import { competitionContext, languageContext, type Context } from '~/context';
import { listStarters } from '~/lib/starters.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { pdfResponse } from '~/pdf/pdf.server';
import { StartersDocument, type ClubGroup, type StarterRow } from '~/pdf/StartersDocument';

/** All starters, or those with `?id=…&id=…`. */
export function loader({ request, context }: Route.LoaderArgs) {
  return startersPdf(context, new URL(request.url).searchParams);
}

/** The same as a form, for many ids. */
export async function action({ request, context }: Route.ActionArgs) {
  requireRole(context, 'VIEWER');
  return startersPdf(context, await request.formData());
}

async function startersPdf(context: Context, params: URLSearchParams | FormData) {
  const competition = context.get(competitionContext);
  const t = getT(context);
  const ids = new Set(params.getAll('id').map(String));
  const all = await listStarters(competition.id);
  const starters = ids.size > 0 ? all.filter(({ id }) => ids.has(id)) : all;
  if (ids.size > 0 && starters.length !== ids.size) throw data(null, 404);

  return pdfResponse(
    createElement(StartersDocument, {
      clubs: groupByClub(starters),
      competitionName: competition.name,
      t,
      language: context.get(languageContext),
    }),
    `${t('pdf:starters.title')} ${competition.name}`,
  );
}

/** Clubs by name. Someone in several contests has a row for each. */
function groupByClub(starters: Awaited<ReturnType<typeof listStarters>>): ClubGroup[] {
  const groups = Map.groupBy(starters, ({ clubId }) => clubId);
  return [...groups.values()]
    .map((members) => {
      const { id, name, location } = members[0].club;
      const rows = members.flatMap(({ entries, ...starter }) =>
        (entries.length > 0 ? entries : [null]).map((entry) => ({
          id: starter.id,
          firstname: starter.firstname,
          lastname: starter.lastname,
          birthYear: starter.birthYear,
          sex: starter.sex,
          category: entry?.category ?? null,
          divisionNumber: entry?.division?.number ?? null,
          apparatus: entry?.lineup?.apparatus ?? null,
        })),
      );
      return { id, name, location, rows: rows.toSorted(compareRows) };
    })
    .toSorted((a, b) => compare(a.name, b.name) || compare(a.location, b.location));
}

function compareRows(a: StarterRow, b: StarterRow) {
  return (
    compare(a.sex, b.sex) ||
    compare(a.category ?? '', b.category ?? '') ||
    (a.divisionNumber ?? 0) - (b.divisionNumber ?? 0) ||
    compare(a.lastname, b.lastname) ||
    compare(a.firstname, b.firstname)
  );
}

function compare(a: string, b: string) {
  return a.localeCompare(b, 'de-CH');
}
