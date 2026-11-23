import { createElement } from 'react';
import { data } from 'react-router';
import type { Route } from './+types/judgingManualPdf';
import { languageContext } from '~/context';
import { getOrCreateJudgeLinks } from '~/lib/access.server';
import { APP_ORIGIN } from '~/lib/env.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { JudgingManualDocument } from '~/pdf/JudgingManualDocument';
import { pdfResponse } from '~/pdf/pdf.server';
import { parseGround } from '~/pdf/request.server';

/** The token is in the fragment, so it is not sent to the server with the page. */
function accessUrl({ id, token }: { id: string; token: string }) {
  return `${APP_ORIGIN}/judge/${id}#${token}`;
}

/** `?link=<id>` or `?ground=1`, otherwise all. Contains the tokens, so it is not for viewers. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const competition = requireRole(context, 'EDITOR');
  const t = getT(context);
  const params = new URL(request.url).searchParams;
  const linkId = params.get('link');
  const ground = params.has('ground') ? parseGround(params.get('ground')!) : null;

  const links = (await getOrCreateJudgeLinks(competition.id)).filter(
    (link) =>
      (linkId === null || link.id === linkId) && (ground === null || link.ground === ground),
  );
  if (links.length === 0) throw data(null, 404);

  return pdfResponse(
    createElement(JudgingManualDocument, {
      links: links.map((link) => ({
        id: link.id,
        ground: link.ground,
        // Judge links always have one.
        apparatus: link.apparatus!,
        url: accessUrl(link),
      })),
      competitionName: competition.name,
      t,
      language: context.get(languageContext),
    }),
    `${t('pdf:manual.title')} ${competition.name}`,
  );
}
