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
  MAX_CELL_BYTES,
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
      /** Of the sheet, when the ink of the cells is sent as `cell-<row>-<column>`. */
      columns: z.number().int().min(1).max(5).optional(),
    }),
  )
  .max(SHEET.rowsPerPage)
  .refine((rows) => new Set(rows.map(({ row }) => row)).size === rows.length);

// Only sent with the ink of the cells: coercing a missing field would make it 0.
const cellSizeSchema = z.object({
  width: z.string().transform(Number),
  height: z.string().transform(Number),
});

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
        keepHandwriting: sheet.keepHandwriting,
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
 * Keeps the grades read from a page: `code`, `rows` as JSON, and `image-<row>` for each. With
 * `cellWidth` and `cellHeight`, also the ink of the cells as `cell-<row>-<column>`. Or with
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
      parsed.data.map(async ({ columns = 0, ...row }) => {
        const image = await readFile(formData.get(`image-${row.row}`), MAX_IMAGE_BYTES);
        if (!image) throw new DomainError('INVALID_INPUT');
        const cells = [];
        for (let column = 0; column < columns; column++) {
          const sent = formData.get(`cell-${row.row}-${column}`);
          // Without one nothing is written there.
          const cell = sent === null ? new Uint8Array() : await readFile(sent, MAX_CELL_BYTES);
          if (!cell) throw new DomainError('INVALID_INPUT');
          cells.push(cell);
        }
        return { ...row, image, cells };
      }),
    );
    const size = cellSizeSchema.safeParse({
      width: formData.get('cellWidth'),
      height: formData.get('cellHeight'),
    });
    const code = String(formData.get('code'));
    return {
      scanned: await saveScannedGrades(id, code, rows, size.success ? size.data : undefined),
    };
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

/** Its bytes, or null when it is no file or too large. The size is checked before reading. */
async function readFile(value: FormDataEntryValue | null, maxBytes: number) {
  if (!(value instanceof File) || value.size > maxBytes) return null;
  return new Uint8Array(await value.arrayBuffer());
}

function parseJson(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}
