import { useTranslation } from 'react-i18next';
import { data, Form, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/profile';
import { FormField } from '~/components/FormField';
import { PageHeader } from '~/components/PageHeader';
import { SubmitButton } from '~/components/SubmitButton';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { auth, authCookies, callAuth, getUser } from '~/lib/auth/auth.server';
import { parseForm } from '~/lib/forms.server';
import { prisma } from '~/lib/prisma.server';
import { createRateLimit } from '~/lib/rateLimit.server';
import { isLanguage, LANGUAGES } from '~/locales';
import { getT, languageCookie } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export function loader({ context }: Route.LoaderArgs) {
  const { email, language } = getUser(context);
  return { email, language };
}

export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const user = getUser(context);
  const formData = await request.formData();

  switch (formData.get('intent')) {
    case 'language': {
      const language = formData.get('language');
      if (!isLanguage(language)) throw data(null, 400);
      const { headers } = await auth.api.updateUser({
        headers: request.headers,
        body: { language },
        returnHeaders: true,
      });
      const cookies = authCookies({ headers });
      cookies.append('Set-Cookie', await languageCookie.serialize(language));
      return redirect('/profile', { headers: cookies });
    }

    case 'email': {
      const { data: values, errors } = parseForm(
        formData,
        z.object({
          email: z
            .string()
            .trim()
            .toLowerCase()
            .pipe(z.email(t('auth:errors.email'))),
          emailPassword: z.string(),
        }),
      );
      if (errors) return data({ errors }, 400);
      if (!mayCheckPassword(user.id)) {
        return data({ errors: { emailPassword: t('errors.tooManyRequests') } }, 429);
      }
      if (!(await checkPassword(request, values.emailPassword))) {
        return data({ errors: { emailPassword: t('auth:errors.currentPassword') } }, 400);
      }
      if (values.email === user.email) return redirect('/profile');

      const { headers } = await auth.api.changeEmail({
        headers: request.headers,
        body: { newEmail: values.email },
        returnHeaders: true,
      });
      // better-auth also reports success when the address is taken.
      const { email } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (email !== values.email) {
        return data({ errors: { email: t('auth:errors.emailFailed') } }, 400);
      }
      // Set at registration, see register.tsx.
      await prisma.user.update({ where: { id: user.id }, data: { name: email } });
      enqueueToast(context, { type: 'success', message: t('auth:profile.emailChanged') });
      return redirect('/profile', { headers: authCookies({ headers }) });
    }

    case 'password': {
      const { data: values, errors } = parseForm(
        formData,
        z
          .object({
            currentPassword: z.string(),
            newPassword: z
              .string()
              .min(8, t('auth:errors.passwordLength'))
              .max(128, t('auth:errors.passwordLength')),
            repeatPassword: z.string(),
          })
          .refine(({ newPassword, repeatPassword }) => newPassword === repeatPassword, {
            path: ['repeatPassword'],
            message: t('auth:errors.passwordMismatch'),
          }),
      );
      if (errors) return data({ errors }, 400);

      const response = await callAuth(request, '/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      });
      if (!response.ok) {
        const message =
          response.status === 429 ? t('errors.tooManyRequests') : t('auth:errors.currentPassword');
        return data({ errors: { currentPassword: message } }, response.status);
      }
      enqueueToast(context, { type: 'success', message: t('auth:profile.passwordChanged') });
      return redirect('/profile', { headers: authCookies(response) });
    }

    default:
      throw data(null, 400);
  }
}

// better-auth only limits requests to its own endpoints, and verifyPassword has none.
const mayCheckPassword = createRateLimit({ windowMs: 60_000, max: 10 });

async function checkPassword(request: Request, password: string) {
  try {
    await auth.api.verifyPassword({ headers: request.headers, body: { password } });
    return true;
  } catch {
    return false;
  }
}

export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation(['auth', 'common']);
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};

  return (
    <>
      <title>{`${t('profile.title')} · UTEG`}</title>
      <PageHeader title={t('profile.title')} />
      <div className="grid max-w-lg gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('common:fields.language')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="grid gap-4">
              <FormField label={t('common:fields.language')}>
                {(props) => (
                  <Select name="language" defaultValue={loaderData.language ?? 'de'}>
                    <SelectTrigger {...props}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((language) => (
                        <SelectItem key={language} value={language}>
                          {t(`common:language.${language}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <SubmitButton name="intent" value="language">
                {t('common:actions.save')}
              </SubmitButton>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('profile.emailTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="grid gap-4">
              <FormField
                label={t('common:fields.email')}
                error={errors.email}
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={loaderData.email}
                required
              />
              <FormField
                label={t('profile.currentPassword')}
                error={errors.emailPassword}
                name="emailPassword"
                type="password"
                autoComplete="current-password"
                required
              />
              <SubmitButton name="intent" value="email">
                {t('common:actions.save')}
              </SubmitButton>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('profile.passwordTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="grid gap-4">
              <FormField
                label={t('profile.currentPassword')}
                error={errors.currentPassword}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
              <FormField
                label={t('profile.newPassword')}
                hint={t('passwordHint')}
                error={errors.newPassword}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
              <FormField
                label={t('repeatPassword')}
                error={errors.repeatPassword}
                name="repeatPassword"
                type="password"
                autoComplete="new-password"
                required
              />
              <SubmitButton name="intent" value="password">
                {t('common:actions.save')}
              </SubmitButton>
            </Form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
