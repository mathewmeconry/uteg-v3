import { useTranslation } from 'react-i18next';
import { data, Form, redirect } from 'react-router';
import type { Route } from './+types/settings';
import { CompetitionFields, GroundsField } from '~/components/competition/CompetitionFields';
import { DeleteCompetitionDialog } from '~/components/competition/DeleteCompetitionDialog';
import { LogoField } from '~/components/competition/LogoField';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { PageHeader } from '~/components/PageHeader';
import { SubmitButton } from '~/components/SubmitButton';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { useCompetition } from '~/hooks/useCompetition';
import { removeLogo, setLogo } from '~/lib/assets.server';
import { competitionSchema, readLogo } from '~/lib/competitionForm.server';
import { deleteCompetition, updateCompetition } from '~/lib/competitions.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { parseForm } from '~/lib/forms.server';
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
        return data({ errors: { grounds: domainErrorMessage(error, t) } }, 400);
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

export default function Settings({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['settings', 'competition', 'common']);
  const { competition, canEdit, isOwner } = useCompetition();
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};

  return (
    <>
      <title>{`${t('title')} · UTEG`}</title>
      <PageHeader title={t('title')} description={canEdit ? undefined : t('readOnly')} />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('general')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <fieldset disabled={!canEdit} className="grid gap-6">
                <CompetitionFields errors={errors} defaults={competition} />
                <GroundsField error={errors.grounds} defaultValue={competition.grounds} />
                {canEdit && (
                  <SubmitButton name="intent" value="details" className="justify-self-start">
                    {t('common:actions.save')}
                  </SubmitButton>
                )}
              </fieldset>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('competition:fields.logo')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            {competition.logoId ? (
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={`/api/assets/${competition.logoId}`}
                  alt={t('logo.current')}
                  className="h-24 max-w-full min-w-0 rounded-md border bg-white object-contain p-2"
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
              <p className="text-muted-foreground">{t('logo.none')}</p>
            )}
            {canEdit && (
              // The key clears the file input after the upload.
              <Form
                key={competition.logoId}
                method="post"
                encType="multipart/form-data"
                className="grid gap-4"
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
          </CardContent>
        </Card>

        {isOwner && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle>{t('delete.title')}</CardTitle>
              <CardDescription>{t('delete.text')}</CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteCompetitionDialog name={competition.name} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
