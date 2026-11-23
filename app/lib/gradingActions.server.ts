import { z } from 'zod';
import type { Context } from '~/context';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';
import { domainErrorMessage } from './domainErrors.server';
import { DomainError } from './errors';
import { parseForm } from './forms.server';
import { confirmRound, deleteGrade } from './judging.server';

const deleteSchema = z.object({
  entryId: z.string().min(1),
  apparatus: z.string().min(1),
  gradeId: z.string().min(1),
  version: z.coerce.number().int(),
});

const confirmSchema = z.object({
  ground: z.coerce.number().int(),
  apparatus: z.string().min(1),
  round: z.coerce.number().int(),
});

/** The deletion of a grade on the grading pages. The role was checked by the action. */
export async function runDeleteGrade(context: Context, competitionId: string, formData: FormData) {
  const { data: values } = parseForm(formData, deleteSchema);
  return run(context, async () => {
    if (!values) throw new DomainError('INVALID_INPUT');
    const { entryId, apparatus, gradeId, version } = values;
    const previous = { id: gradeId, version };
    await deleteGrade(competitionId, { entryId, apparatus, previous }, { kind: 'editor' });
  });
}

/** The confirmation of a round on the grading page. The role was checked by the action. */
export async function runConfirmRound(context: Context, competitionId: string, formData: FormData) {
  const { data: values } = parseForm(formData, confirmSchema);
  const divisionIds = formData.getAll('divisionIds').map(String);
  return run(context, async () => {
    if (!values) throw new DomainError('INVALID_INPUT');
    await confirmRound(competitionId, { ...values, divisionIds });
    const message = getT(context)('judging:grading.confirmed');
    enqueueToast(context, { type: 'success', message });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Errors become a toast, typed grades stay on the page. */
async function run(context: Context, change: () => Promise<void>) {
  try {
    await change();
  } catch (error) {
    enqueueToast(context, { type: 'error', message: domainErrorMessage(error, getT(context)) });
  }
  return null;
}
