import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/register';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { languageContext } from '~/context';
import { authCookies, callAuth } from '~/lib/auth/auth.server';
import { safeRedirect } from '~/lib/auth/redirect';
import { parseForm, type FieldErrors } from '~/lib/forms.server';
import { getT } from '~/middlewares/i18n.server';

type ActionData = { error?: string; errors?: FieldErrors };

export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const formData = await request.formData();
  const { data: values, errors } = parseForm(
    formData,
    z
      .object({
        email: z
          .string()
          .trim()
          .pipe(z.email(t('auth:errors.email'))),
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

  const response = await callAuth(request, '/sign-up/email', {
    email: values.email,
    password: values.password,
    // better-auth requires a name, the app only shows the address.
    name: values.email,
    language: context.get(languageContext),
  });
  if (response.status === 429) return data<ActionData>({ error: t('errors.tooManyRequests') }, 429);
  if (response.status >= 500) return data<ActionData>({ error: t('errors.generic') }, 500);
  if (!response.ok) return data<ActionData>({ error: t('auth:errors.registerFailed') }, 400);

  return redirect(safeRedirect(formData.get('redirectTo')), { headers: authCookies(response) });
}

export default function Register({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [searchParams] = useSearchParams();

  return (
    <>
      <title>{`${t('registerTitle')} · UTEG`}</title>
      <h1 className="mb-6 font-display text-3xl leading-tight">{t('registerTitle')}</h1>
      <Form method="post" className="grid gap-5">
        {actionData?.error && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="redirectTo" value={searchParams.get('redirectTo') ?? '/home'} />
        <FormField
          label={t('common:fields.email')}
          error={actionData?.errors?.email}
          name="email"
          type="email"
          autoComplete="email"
          className="h-12"
          required
        />
        <FormField
          label={t('common:fields.password')}
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
          {t('registerTitle')}
        </SubmitButton>
        <p className="text-sm text-muted-foreground">
          {t('haveAccount')}{' '}
          <Link
            to={{ pathname: '/login', search: searchParams.toString() }}
            className="inline-flex items-center font-semibold text-primary underline underline-offset-4 pointer-coarse:min-h-11"
          >
            {t('loginTitle')}
          </Link>
        </p>
      </Form>
    </>
  );
}
