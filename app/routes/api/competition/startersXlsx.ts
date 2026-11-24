import { data } from 'react-router';
import type { Route } from './+types/startersXlsx';
import { createStartersWorkbook } from '~/components/starters/startersWorkbook.server';
import { toStarterRow } from '~/components/starters/starterRow';
import { Role } from '~/generated/prisma/enums';
import { listStarters } from '~/lib/starters.server';
import { requireRole } from '~/middlewares/competition.server';
import { getDocumentI18n } from '~/middlewares/i18n.server';

/** The starters of the repeated field `id` in that order. A form, long lists don't fit an address. */
export async function action({ request, context }: Route.ActionArgs) {
  const competition = requireRole(context, Role.CHECK_IN);
  const { t } = getDocumentI18n(request, context);
  const formData = await request.formData();
  const contestId = formData.get('contest') ?? competition.contests[0]?.id;
  if (!competition.contests.some(({ id }) => id === contestId)) throw data(null, 404);

  const starters = await listStarters(competition.id);
  const byId = new Map(starters.map((starter) => [starter.id, starter]));
  const rows = formData
    .getAll('id')
    .flatMap((id) => byId.get(String(id)) ?? [])
    .map((starter) => toStarterRow(starter, String(contestId)));

  return new Response(await createStartersWorkbook(rows, t), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${t('starters:title')}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
