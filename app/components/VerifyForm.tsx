import { MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { CodeField } from './CodeField';
import { SubmitButton } from './SubmitButton';

/** Asks for the code that was sent to verify an address, after registering or logging in. */
export function VerifyForm({ email, redirectTo }: { email: string; redirectTo: string }) {
  const { t } = useTranslation('auth');
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
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <CodeField error={verify.errors?.code} className="h-12" />
        <SubmitButton size="lg" pending={verify.pending}>
          {t('verify.confirm')}
        </SubmitButton>
        <Button
          type="button"
          variant="outline"
          disabled={resend.pending}
          onClick={() =>
            void resend.submit(
              { intent: 'resend', email },
              { method: 'post', action: '/verify-email' },
            )
          }
        >
          {t('verify.resend')}
        </Button>
      </verify.Form>
    </>
  );
}
