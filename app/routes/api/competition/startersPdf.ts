import { data } from 'react-router';
import type { Route } from './+types/startersPdf';
import { competitionContext, type Context } from '~/context';
import { listStarters } from '~/lib/starters.server';
import { requirePermission } from '~/middlewares/competition.server';
import { getDocumentI18n } from '~/middlewares/i18n.server';
import { readParams } from '~/pdf/request.server';
import { pdfResponse } from '~/pdf/response.server';
import type { ClubGroup, StarterRow } from '~/pdf/StartersDocument';

/** All starters, or those with `?id=…&id=…`. */
export function loader({ request, context }: Route.LoaderArgs) {
  requirePermission(context, 'view', 'checkIn');
  return startersPdf(request, context);
}

/** The same as a form, for many ids. */
export function action({ request, context }: Route.ActionArgs) {
  requirePermission(context, 'view', 'checkIn');
  return startersPdf(request, context);
}

async function startersPdf(request: Request, context: Context) {
  const competition = context.get(competitionContext);
  const { language, t } = getDocumentI18n(request, context);
  const ids = new Set((await readParams(request)).getAll('id'));
  const all = await listStarters(competition.id);
  const starters = ids.size > 0 ? all.filter(({ id }) => ids.has(id)) : all;
  if (ids.size > 0 && starters.length !== ids.size) throw data(null, 404);

  return pdfResponse(
    {
      type: 'starters',
      language,
      props: { clubs: groupByClub(starters), competitionName: competition.name },
    },
    { name: `${t('pdf:starters.title')} ${competition.name}`, signal: request.signal, t },
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
          apparatus: entry?.startApparatus ?? null,
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
