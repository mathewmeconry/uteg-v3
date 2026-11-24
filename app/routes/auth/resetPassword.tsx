import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/resetPassword';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { callAuth } from '~/lib/auth/auth.server';
import { parseForm, type FieldErrors } from '~/lib/forms.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

type ActionData = { error?: string; errors?: FieldErrors };

export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const { data: values, errors } = parseForm(
    await request.formData(),
    z
      .object({
        token: z.string(),
        password: z
          .string()
          .min(8, t('auth:errors.passwordLength'))
          .max(128, t('auth:errors.passwordLength')),
        repeatPassword: z.string(),
      })
      .refine(({ password, repeatPassword }) => password === repeatPassword, {
        path: ['repeatPassword'],
        message: t('auth:errors.passwordMismatch'),
      }),
  );
  if (errors) return data<ActionData>({ errors }, 400);

  const response = await callAuth(request, '/reset-password', {
    token: values.token,
    newPassword: values.password,
  });
  if (response.status === 429) return data<ActionData>({ error: t('errors.tooManyRequests') }, 429);
  if (response.status >= 500) return data<ActionData>({ error: t('errors.generic') }, 500);
  if (!response.ok) return data<ActionData>({ error: t('auth:reset.invalid') }, 400);

  enqueueToast(context, { type: 'success', message: t('auth:reset.done') });
  return redirect('/login');
}

export default function ResetPassword({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [searchParams] = useSearchParams();

  return (
    <>
      <title>{`${t('reset.title')} · UTEG`}</title>
      <h1 className="mb-6 font-display text-3xl leading-tight">{t('reset.title')}</h1>
      <Form method="post" className="grid gap-5">
        {actionData?.error && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="token" value={searchParams.get('token') ?? ''} />
        <FormField
          label={t('profile.newPassword')}
          hint={t('passwordHint')}
          error={actionData?.errors?.password}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          className="h-12"
          required
        />
        <FormField
          label={t('repeatPassword')}
          error={actionData?.errors?.repeatPassword}
          name="repeatPassword"
          type="password"
          autoComplete="new-password"
          className="h-12"
          required
        />
        <SubmitButton size="lg" className="mt-1">
          {t('reset.save')}
        </SubmitButton>
        <p className="text-sm">
          <Link
            to="/forgot-password"
            className="inline-flex items-center font-semibold text-primary underline underline-offset-4 pointer-coarse:min-h-11"
          >
            {t('reset.newLink')}
          </Link>
        </p>
      </Form>
    </>
  );
}
