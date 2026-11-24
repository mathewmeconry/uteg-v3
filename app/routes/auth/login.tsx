import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/login';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { VerifyForm } from '~/components/VerifyForm';
import { Alert, AlertDescription } from '~/components/ui/alert';
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
  // The password is right, better-auth has sent a code.
  if (response.status === 403) return data({ verify: credentials.email }, 403);
  if (!response.ok) return data({ error: t('auth:errors.credentials') }, 400);

  return redirect(safeRedirect(formData.get('redirectTo')), { headers: authCookies(response) });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/home';

  if (actionData && 'verify' in actionData) {
    return <VerifyForm email={actionData.verify} redirectTo={redirectTo} />;
  }

  return (
    <>
      <title>{`${t('loginTitle')} · UTEG`}</title>
      <h1 className="mb-6 font-display text-3xl leading-tight">{t('loginTitle')}</h1>
      <Form method="post" className="grid gap-5">
        {actionData?.error && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <FormField
          label={t('common:fields.email')}
          name="email"
          type="email"
          autoComplete="email"
          className="h-12"
          required
        />
        <FormField
          label={t('common:fields.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-12"
          required
        />
        <SubmitButton size="lg" className="mt-1">
          {t('loginTitle')}
        </SubmitButton>
        <p className="text-sm">
          <Link
            to="/forgot-password"
            className="inline-flex items-center font-semibold text-primary underline underline-offset-4 pointer-coarse:min-h-11"
          >
            {t('forgot.link')}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          {t('noAccount')}{' '}
          <Link
            to={{ pathname: '/register', search: searchParams.toString() }}
            className="inline-flex items-center font-semibold text-primary underline underline-offset-4 pointer-coarse:min-h-11"
          >
            {t('registerTitle')}
          </Link>
        </p>
      </Form>
    </>
  );
}
