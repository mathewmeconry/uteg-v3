import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/register';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
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
    <Card>
      <title>{`${t('registerTitle')} · UTEG`}</title>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{t('registerTitle')}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post" className="grid gap-4">
          {actionData?.error && (
            <Alert variant="destructive">
              <AlertDescription>{actionData.error}</AlertDescription>
            </Alert>
          )}
          <input
            type="hidden"
            name="redirectTo"
            value={searchParams.get('redirectTo') ?? '/home'}
          />
          <FormField
            label={t('common:fields.email')}
            error={actionData?.errors?.email}
            name="email"
            type="email"
            autoComplete="email"
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
            required
          />
          <FormField
            label={t('repeatPassword')}
            error={actionData?.errors?.repeatPassword}
            name="repeatPassword"
            type="password"
            autoComplete="new-password"
            required
          />
          <SubmitButton size="lg">{t('registerTitle')}</SubmitButton>
          <p className="text-center text-sm">
            {t('haveAccount')}{' '}
            <Link
              to={{ pathname: '/login', search: searchParams.toString() }}
              className="font-medium underline"
            >
              {t('loginTitle')}
            </Link>
          </p>
        </Form>
      </CardContent>
    </Card>
  );
}
