import { useTranslation } from 'react-i18next';
import { data, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/newCompetition';
import { CreateWizard } from '~/components/competition/CreateWizard';
import { PageHeader } from '~/components/PageHeader';
import { Role } from '~/generated/prisma/enums';
import { useUser } from '~/hooks/useUser';
import { checkLogo } from '~/lib/assets.server';
import { getUser } from '~/lib/auth/auth.server';
import { competitionSchema, parseJson, readLogo } from '~/lib/competitionForm.server';
import { createCompetition, findUnknownEmails } from '~/lib/competitions.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { DomainError } from '~/lib/errors';
import { parseForm, type FieldErrors } from '~/lib/forms.server';
import type { ServerT } from '~/locales';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

const membersSchema = z.array(z.object({ email: z.string().toLowerCase(), role: z.enum(Role) }));
const modulesSchema = z.array(z.enum(['egt'])).min(1);

export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const formData = await request.formData();

  const details = parseForm(formData, competitionSchema(t));
  const modules = modulesSchema.safeParse(formData.getAll('modules'));
  const contests = modules.data?.map((module) => ({
    module,
    config: parseJson(formData.get(`config.${module}`)),
  }));
  const logo = await readLogo(formData);
  const members = membersSchema.safeParse(parseJson(formData.get('members')));
  const emails = members.data?.map(({ email }) => email) ?? [];

  const errors: FieldErrors = { ...details.errors };
  if (!modules.success) errors.modules = t('competition:errors.modules');
  // createCompetition would take the default config.
  if (contests?.some(({ config }) => !config)) errors.config = t('competition:errors.config');
  const membersError = members.success
    ? await getMembersError(emails, getUser(context).email, t)
    : t('errors.invalid');
  if (membersError) errors.members = membersError;
  try {
    if (logo) checkLogo(logo);
  } catch (error) {
    errors.logo = domainErrorMessage(error, t);
  }
  if (!details.data || !contests || !members.data || Object.keys(errors).length > 0) {
    return data({ errors }, 400);
  }

  let competition;
  try {
    competition = await createCompetition(getUser(context).id, {
      ...details.data,
      contests,
      members: members.data,
      logo,
    });
  } catch (error) {
    const isConfig = error instanceof DomainError && error.code === 'INVALID_CONFIG';
    const message = isConfig ? t('competition:errors.config') : domainErrorMessage(error, t);
    return data({ errors: { [isConfig ? 'config' : 'members']: message } as FieldErrors }, 400);
  }
  enqueueToast(context, { type: 'success', message: t('competition:wizard.created') });
  return redirect(`/competitions/${competition.id}`);
}

/** Names the addresses that cannot become members. */
async function getMembersError(emails: string[], ownEmail: string, t: ServerT) {
  const invalid = emails.filter((email) => !z.email().safeParse(email).success);
  if (invalid.length > 0) {
    return t('competition:errors.invalidMembers', { emails: invalid.join(', ') });
  }
  const all = [ownEmail, ...emails];
  const repeated = all.filter((email, index) => all.indexOf(email) !== index);
  if (repeated.length > 0) {
    return t('competition:errors.repeatedMembers', { emails: repeated.join(', ') });
  }
  const unknown = await findUnknownEmails(emails);
  if (unknown.length > 0) {
    return t('competition:errors.unknownMembers', { emails: unknown.join(', ') });
  }
}

export default function NewCompetition({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation('competition');
  const { email } = useUser();

  return (
    <>
      <title>{`${t('new')} · UTEG`}</title>
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('new')} breadcrumbs={[{ to: '/home', label: t('listTitle') }]} />
        <CreateWizard ownEmail={email} errors={actionData?.errors} />
      </div>
    </>
  );
}
