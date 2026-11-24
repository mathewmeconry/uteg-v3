import { isAPIError } from 'better-auth/api';
import { useTranslation } from 'react-i18next';
import { data, Form, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/profile';
import { CodeField } from '~/components/CodeField';
import { FormField } from '~/components/FormField';
import { PageHeader } from '~/components/PageHeader';
import { Section, Sections } from '~/components/Section';
import { SubmitButton } from '~/components/SubmitButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { auth, authCookies, callAuth, getUser, mayTryCode } from '~/lib/auth/auth.server';
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

      if (await prisma.user.findUnique({ where: { email: values.email } })) {
        return data({ errors: { email: t('auth:errors.emailFailed') } }, 400);
      }
      await auth.api.requestEmailChangeEmailOTP({
        headers: request.headers,
        body: { newEmail: values.email },
      });
      return data({ errors: {}, newEmail: values.email });
    }

    case 'emailCode': {
      const { data: values } = parseForm(
        formData,
        z.object({ newEmail: z.email(), code: z.string().trim() }),
      );
      if (!values) throw data(null, 400);
      const { newEmail, code } = values;
      if (!mayTryCode(newEmail)) {
        return data({ errors: { code: t('errors.tooManyRequests') }, newEmail }, 429);
      }
      let headers;
      try {
        ({ headers } = await auth.api.changeEmailEmailOTP({
          headers: request.headers,
          body: { newEmail, otp: code },
          returnHeaders: true,
        }));
      } catch (error) {
        if (!isAPIError(error)) throw error;
        return data({ errors: { code: t('auth:verify.invalid') }, newEmail }, 400);
      }
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
  const newEmail = actionData && 'newEmail' in actionData ? actionData.newEmail : undefined;

  return (
    <>
      <title>{`${t('profile.title')} · UTEG`}</title>
      <PageHeader title={t('profile.title')} />
      <Sections>
        <Section title={t('common:fields.language')}>
          <Form method="post" className="flex max-w-md items-end gap-3">
            <FormField label={t('profile.languageLabel')}>
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
            <SubmitButton name="intent" value="language" variant="outline">
              {t('common:actions.save')}
            </SubmitButton>
          </Form>
        </Section>

        <Section title={t('profile.emailTitle')} description={t('profile.emailText')}>
          <Form method="post" className="grid max-w-md gap-5">
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
            <SubmitButton
              name="intent"
              value="email"
              variant="outline"
              className="justify-self-start"
            >
              {t('profile.emailSave')}
            </SubmitButton>
          </Form>
          {newEmail && (
            <Form method="post" className="mt-7 grid max-w-md gap-5">
              <p role="status">{t('verify.sent', { email: newEmail })}</p>
              <input type="hidden" name="newEmail" value={newEmail} />
              <CodeField error={errors.code} />
              <SubmitButton name="intent" value="emailCode" className="justify-self-start">
                {t('verify.confirm')}
              </SubmitButton>
            </Form>
          )}
        </Section>

        <Section title={t('profile.passwordTitle')} description={t('profile.passwordText')}>
          <Form method="post" className="grid max-w-md gap-5">
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
            <SubmitButton
              name="intent"
              value="password"
              variant="outline"
              className="justify-self-start"
            >
              {t('profile.passwordTitle')}
            </SubmitButton>
          </Form>
        </Section>
      </Sections>
    </>
  );
}
