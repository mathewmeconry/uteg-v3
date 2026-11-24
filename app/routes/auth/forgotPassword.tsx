import { MailIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/forgotPassword';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { callAuth } from '~/lib/auth/auth.server';
import { parseForm, type FieldErrors } from '~/lib/forms.server';
import { getT } from '~/middlewares/i18n.server';

type ActionData = { error?: string; errors?: FieldErrors; sent?: boolean };

export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const { data: values, errors } = parseForm(
    await request.formData(),
    z.object({
      email: z
        .string()
        .trim()
        .pipe(z.email(t('auth:errors.email'))),
    }),
  );
  if (errors) return data<ActionData>({ errors }, 400);

  const response = await callAuth(request, '/request-password-reset', values);
  if (response.status === 429) return data<ActionData>({ error: t('errors.tooManyRequests') }, 429);
  if (!response.ok) return data<ActionData>({ error: t('errors.generic') }, 500);
  return data<ActionData>({ sent: true });
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['auth', 'common']);

  return (
    <>
      <title>{`${t('forgot.title')} · UTEG`}</title>
      <h1 className="mb-6 font-display text-3xl leading-tight">{t('forgot.title')}</h1>
      <div className="grid gap-5">
        {actionData?.sent ? (
          <Alert>
            <MailIcon aria-hidden />
            <AlertDescription>{t('forgot.sent')}</AlertDescription>
          </Alert>
        ) : (
          <Form method="post" className="grid gap-5">
            {actionData?.error && (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden />
                <AlertDescription>{actionData.error}</AlertDescription>
              </Alert>
            )}
            <FormField
              label={t('common:fields.email')}
              hint={t('forgot.hint')}
              error={actionData?.errors?.email}
              name="email"
              type="email"
              autoComplete="email"
              className="h-12"
              required
            />
            <SubmitButton size="lg" className="mt-1">
              {t('forgot.send')}
            </SubmitButton>
          </Form>
        )}
        <p className="text-sm">
          <Link
            to="/login"
            className="inline-flex items-center font-semibold text-primary underline underline-offset-4 pointer-coarse:min-h-11"
          >
            {t('loginTitle')}
          </Link>
        </p>
      </div>
    </>
  );
}
