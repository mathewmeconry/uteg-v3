import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, redirect } from 'react-router';
import type { Route } from './+types/settings';
import {
  CompetitionFields,
  GroundsField,
  SexesField,
  type Sexes,
} from '~/components/competition/CompetitionFields';
import { DeleteCompetitionDialog } from '~/components/competition/DeleteCompetitionDialog';
import { LogoField } from '~/components/competition/LogoField';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { PageHeader } from '~/components/PageHeader';
import { Section, Sections } from '~/components/Section';
import { SubmitButton } from '~/components/SubmitButton';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { useActionErrors } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { removeLogo, setLogo } from '~/lib/assets.server';
import { competitionSchema, readLogo } from '~/lib/competitionForm.server';
import { deleteCompetition, updateCompetition } from '~/lib/competitions.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { setKeepHandwriting } from '~/lib/handwriting.server';
import { DomainError } from '~/lib/errors';
import { parseForm } from '~/lib/forms.server';
import { safeClientAction } from '~/lib/safeClientAction';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const formData = await request.formData();

  switch (formData.get('intent')) {
    case 'details': {
      const { data: values, errors } = parseForm(formData, competitionSchema(t));
      if (errors) return data({ errors }, 400);
      try {
        await updateCompetition(id, values);
      } catch (error) {
        const field =
          error instanceof DomainError && error.code === 'SEX_IN_USE' ? 'sexes' : 'grounds';
        return data(
          { errors: { [field]: domainErrorMessage(error, t) } as Record<string, string> },
          400,
        );
      }
      enqueueToast(context, { type: 'success', message: t('settings:saved') });
      return redirect('.');
    }

    case 'logo': {
      const logo = await readLogo(formData);
      if (!logo) return data({ errors: { logo: t('competition:errors.logoMissing') } }, 400);
      try {
        await setLogo(id, logo);
      } catch (error) {
        return data({ errors: { logo: domainErrorMessage(error, t) } }, 400);
      }
      enqueueToast(context, { type: 'success', message: t('settings:logo.saved') });
      return redirect('.');
    }

    case 'handwriting': {
      // About people's handwriting: the owner decides.
      requireRole(context, 'OWNER');
      await setKeepHandwriting(id, formData.get('keepHandwriting') === 'on');
      enqueueToast(context, { type: 'success', message: t('settings:saved') });
      return redirect('.');
    }

    case 'removeLogo': {
      await removeLogo(id);
      enqueueToast(context, { type: 'success', message: t('settings:logo.removed') });
      return redirect('.');
    }

    case 'delete': {
      const { name } = requireRole(context, 'OWNER');
      if (String(formData.get('confirmName')).trim() !== name) {
        return data({ errors: { confirmName: t('settings:delete.nameMismatch') } }, 400);
      }
      await deleteCompetition(id);
      enqueueToast(context, { type: 'success', message: t('settings:delete.done') });
      return redirect('/home');
    }

    default:
      throw data(null, 400);
  }
}

export const clientAction = safeClientAction;

export default function Settings({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['settings', 'competition', 'common']);
  const { competition, canEdit, isOwner } = useCompetition();
  const errors = useActionErrors(actionData);
  const [sexes, setSexes] = useState<Sexes>(
    competition.sexes.length > 1 ? 'BOTH' : competition.sexes[0],
  );

  return (
    <>
      <title>{`${t('title')} · UTEG`}</title>
      <PageHeader title={t('title')} description={canEdit ? undefined : t('readOnly')} />
      <Sections>
        <Section title={t('general')} description={t('generalText')}>
          <Form method="post">
            <fieldset disabled={!canEdit} className="grid gap-5">
              <CompetitionFields errors={errors} defaults={competition} />
              <GroundsField error={errors.grounds} defaultValue={competition.grounds} />
              <SexesField error={errors.sexes} value={sexes} onChange={setSexes} />
              {canEdit && (
                <SubmitButton name="intent" value="details" className="justify-self-start">
                  {t('common:actions.save')}
                </SubmitButton>
              )}
            </fieldset>
          </Form>
        </Section>

        <Section title={t('competition:fields.logo')} description={t('logo.text')}>
          <div className="grid grid-cols-1 gap-5">
            {competition.logoId ? (
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={`/api/assets/${competition.logoId}`}
                  alt={t('logo.current')}
                  className="h-24 max-w-full min-w-0 rounded-lg border bg-white object-contain p-2"
                />
                {canEdit && (
                  <ConfirmDialog
                    trigger={<Button variant="outline">{t('logo.remove')}</Button>}
                    title={`${t('logo.remove')}?`}
                    description={t('logo.removeText')}
                    confirmLabel={t('common:actions.remove')}
                    destructive
                    fields={{ intent: 'removeLogo' }}
                  />
                )}
              </div>
            ) : (
              !canEdit && <p className="text-muted-foreground">{t('logo.none')}</p>
            )}
            {canEdit && (
              // The key clears the file input after the upload.
              <Form
                key={competition.logoId}
                method="post"
                encType="multipart/form-data"
                className="grid grid-cols-1 gap-4"
              >
                <LogoField error={errors.logo} required />
                <SubmitButton
                  name="intent"
                  value="logo"
                  variant="outline"
                  className="justify-self-start"
                >
                  {t('logo.upload')}
                </SubmitButton>
              </Form>
            )}
          </div>
        </Section>

        <Section title={t('handwriting.title')} description={t('handwriting.text')}>
          <Form method="post">
            <fieldset disabled={!isOwner} className="grid gap-4">
              <Label htmlFor="keep-handwriting" className="min-h-11 leading-normal font-normal">
                <Switch
                  id="keep-handwriting"
                  name="keepHandwriting"
                  defaultChecked={competition.keepHandwriting}
                />
                {t('handwriting.keep')}
              </Label>
              {isOwner && (
                <SubmitButton
                  name="intent"
                  value="handwriting"
                  variant="outline"
                  className="justify-self-start"
                >
                  {t('common:actions.save')}
                </SubmitButton>
              )}
            </fieldset>
          </Form>
        </Section>

        {isOwner && (
          <Section tone="danger" title={t('delete.title')} description={t('delete.text')}>
            <DeleteCompetitionDialog name={competition.name} />
          </Section>
        )}
      </Sections>
    </>
  );
}
