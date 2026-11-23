import { data } from 'react-router';
import type { Route } from './+types/judgingManualPdf';
import { languageContext } from '~/context';
import { accessUrl, getOrCreateJudgeLinks } from '~/lib/access.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { parseGround, readParams } from '~/pdf/request.server';
import { pdfResponse } from '~/pdf/response.server';

/** `?link=<id>` or `?ground=1`, otherwise all. Contains the tokens, so it is not for viewers. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const competition = requireRole(context, 'EDITOR');
  const t = getT(context);
  const params = await readParams(request);
  const linkId = params.get('link');
  const ground = params.has('ground') ? parseGround(params.get('ground')!) : null;

  const links = (await getOrCreateJudgeLinks(competition.id)).filter(
    (link) =>
      (linkId === null || link.id === linkId) && (ground === null || link.ground === ground),
  );
  if (links.length === 0) throw data(null, 404);

  return pdfResponse(
    {
      type: 'judgingManual',
      language: context.get(languageContext),
      props: {
        links: links.map((link) => ({
          id: link.id,
          ground: link.ground,
          // Judge links always have one.
          apparatus: link.apparatus!,
          url: accessUrl(link),
        })),
        competitionName: competition.name,
      },
    },
    { name: `${t('pdf:manual.title')} ${competition.name}`, signal: request.signal, t },
  );
}
