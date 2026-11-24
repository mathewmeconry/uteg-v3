import { data } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/clubs';
import { createClub } from '~/lib/clubs.server';
import { parseForm } from '~/lib/forms.server';
import { requireEditorOrCheckIn } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';

export async function action({ request, context }: Route.ActionArgs) {
  requireEditorOrCheckIn(context);
  const t = getT(context);
  const required = z.string().trim().min(1, t('errors.required')).max(200, t('errors.invalid'));
  const schema = z.object({ name: required, location: required });

  const { data: values, errors } = parseForm(await request.formData(), schema);
  if (errors) return data({ errors }, 400);
  return { club: await createClub(values) };
}
