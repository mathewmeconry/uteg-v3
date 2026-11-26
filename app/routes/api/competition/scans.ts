import { data } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/scans';
import { actionError } from '~/lib/domainErrors.server';
import { DomainError } from '~/lib/errors';
import { readForm } from '~/lib/forms.server';
import { SHEET } from '~/lib/judgingSheet';
import {
  discardScannedGrade,
  getScannedSheet,
  MAX_IMAGE_BYTES,
  saveScannedGrades,
} from '~/lib/scans.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';

// At most a page, each row once: every row reads an image.
const rowsSchema = z
  .array(
    z.object({
      row: z.number().int().min(0),
      value: z.number().int().optional(),
      attempts: z.array(z.number().int()).max(4).optional(),
      confidence: z.number(),
    }),
  )
  .max(SHEET.rowsPerPage)
  .refine((rows) => new Set(rows.map(({ row }) => row)).size === rows.length);

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
        rows: sheet.rows.map(
          ({ entryId, firstname, lastname, withdrawn, inputRule, precision, grade }) => ({
            entryId,
            firstname,
            lastname,
            withdrawn,
            inputRule,
            precision,
            grade: grade && {
              value: grade.value,
              attempts: grade.attempts,
              version: grade.version,
            },
          }),
        ),
      },
    };
  } catch (error) {
    return failure(error, context);
  }
}

/**
 * Keeps the grades read from a page: `code`, `rows` as JSON, and `image-<row>` for each. Or with
 * `intent=discard`, drops the scanned grade `id`.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const formData = await readForm(request, { allowFiles: true });
  try {
    if (formData.get('intent') === 'discard') {
      await discardScannedGrade(id, String(formData.get('id')));
      return { discarded: true };
    }
    const parsed = rowsSchema.safeParse(parseJson(formData.get('rows')));
    if (!parsed.success) throw new DomainError('INVALID_INPUT');
    const rows = await Promise.all(
      parsed.data.map(async (row) => {
        const image = formData.get(`image-${row.row}`);
        // Before reading it.
        if (!(image instanceof File) || image.size > MAX_IMAGE_BYTES) {
          throw new DomainError('INVALID_INPUT');
        }
        return { ...row, image: new Uint8Array(await image.arrayBuffer()) };
      }),
    );
    return { scanned: await saveScannedGrades(id, String(formData.get('code')), rows) };
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
