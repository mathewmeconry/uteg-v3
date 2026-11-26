import { data } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/scans';
import { actionError } from '~/lib/domainErrors.server';
import { DomainError } from '~/lib/errors';
import { readForm } from '~/lib/forms.server';
import { getScannedSheet, saveScannedGrades } from '~/lib/scans.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';

const rowsSchema = z.array(
  z.object({
    row: z.number().int().min(0),
    value: z.number().int().optional(),
    attempts: z.array(z.number().int()).optional(),
    confidence: z.number(),
  }),
);

/** `?code=`: the rows of a scanned page of the judging sheets, to read their cells. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const code = new URL(request.url).searchParams.get('code') ?? '';
  try {
    const sheet = await getScannedSheet(id, code);
    return {
      sheet: {
        apparatus: sheet.apparatus,
        round: sheet.round,
        attempts: sheet.attempts,
        divisions: sheet.divisions.map(({ contestId, ground, category, sex, number }) => ({
          contestId,
          ground,
          category,
          sex,
          number,
        })),
        rows: sheet.rows.map(({ firstname, lastname, withdrawn, inputRule, precision }) => ({
          firstname,
          lastname,
          withdrawn,
          inputRule,
          precision,
        })),
      },
    };
  } catch (error) {
    return failure(error, context);
  }
}

/** Keeps the grades read from a page: `code`, `rows` as JSON, and `image-<row>` for each. */
export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const formData = await readForm(request, { allowFiles: true });
  try {
    const parsed = rowsSchema.safeParse(parseJson(formData.get('rows')));
    if (!parsed.success) throw new DomainError('INVALID_INPUT');
    const rows = await Promise.all(
      parsed.data.map(async (row) => {
        const image = formData.get(`image-${row.row}`);
        if (!(image instanceof File)) throw new DomainError('INVALID_INPUT');
        return { ...row, image: new Uint8Array(await image.arrayBuffer()) };
      }),
    );
    return { count: await saveScannedGrades(id, String(formData.get('code')), rows) };
  } catch (error) {
    return failure(error, context);
  }
}

/** The sheets of other competitions are not found, which is what has to be said. */
function failure(error: unknown, context: Route.LoaderArgs['context']) {
  const t = getT(context);
  if (error instanceof DomainError && error.code === 'NOT_FOUND') {
    return data({ error: t('judging:scan.otherSheet') }, 404);
  }
  return actionError(error, t);
}

function parseJson(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}
