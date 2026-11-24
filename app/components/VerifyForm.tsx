import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { CodeField } from './CodeField';
import { FormField } from './FormField';
import { SubmitButton } from './SubmitButton';

/** Asks for the code that was sent to verify an address, after registering or logging in. */
export function VerifyForm({
  email,
  password: knownPassword,
  redirectTo,
}: {
  email: string;
  /** Empty if the form before was sent before the page was ready. */
  password: string;
  redirectTo: string;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const [password, setPassword] = useState(knownPassword);
  const verify = useActionFetcher();
  const resend = useActionFetcher(() => toast.success(t('verify.resent')));

  return (
    <>
      <title>{`${t('verify.title')} · UTEG`}</title>
      <h1 className="mb-6 font-display text-3xl leading-tight">{t('verify.title')}</h1>
      <verify.Form method="post" action="/verify-email" className="grid gap-5">
        <Alert>
          <MailIcon aria-hidden />
          <AlertDescription>{t('verify.sent', { email })}</AlertDescription>
        </Alert>
        <input type="hidden" name="email" value={email} />
        {knownPassword ? (
          <input type="hidden" name="password" value={password} />
        ) : (
          <FormField
            label={t('common:fields.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12"
            required
          />
        )}
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <CodeField errors={verify.errors} />
        <SubmitButton size="lg" pending={verify.pending}>
          {t('verify.confirm')}
        </SubmitButton>
        <Button
          type="button"
          variant="outline"
          disabled={resend.pending}
          onClick={() =>
            void resend.submit(
              { intent: 'resend', email, password },
              { method: 'post', action: '/verify-email' },
            )
          }
        >
          {t('verify.resend')}
        </Button>
        <p className="text-sm text-muted-foreground">
          {t('verify.noCode')}{' '}
          <Link
            to="/forgot-password"
            className="inline-flex items-center font-semibold text-primary underline underline-offset-4 pointer-coarse:min-h-11"
          >
            {t('forgot.title')}
          </Link>
        </p>
      </verify.Form>
    </>
  );
}
