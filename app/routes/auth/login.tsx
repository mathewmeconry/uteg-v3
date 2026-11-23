import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/login';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { authCookies, callAuth } from '~/lib/auth/auth.server';
import { safeRedirect } from '~/lib/auth/redirect';
import { parseForm } from '~/lib/forms.server';
import { getT } from '~/middlewares/i18n.server';

const schema = z.object({ email: z.string().trim(), password: z.string() });

export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const formData = await request.formData();
  const { data: credentials } = parseForm(formData, schema);
  if (!credentials) return data({ error: t('auth:errors.credentials') }, 400);

  const response = await callAuth(request, '/sign-in/email', credentials);
  if (response.status === 429) return data({ error: t('errors.tooManyRequests') }, 429);
  if (response.status >= 500) return data({ error: t('errors.generic') }, 500);
  if (!response.ok) return data({ error: t('auth:errors.credentials') }, 400);

  return redirect(safeRedirect(formData.get('redirectTo')), { headers: authCookies(response) });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [searchParams] = useSearchParams();

  return (
    <Card>
      <title>{`${t('loginTitle')} · UTEG`}</title>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{t('loginTitle')}</h1>
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
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <FormField
            label={t('common:fields.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <SubmitButton size="lg">{t('loginTitle')}</SubmitButton>
          <p className="text-center text-sm">
            {t('noAccount')}{' '}
            <Link
              to={{ pathname: '/register', search: searchParams.toString() }}
              className="font-medium underline"
            >
              {t('registerTitle')}
            </Link>
          </p>
        </Form>
      </CardContent>
    </Card>
  );
}
