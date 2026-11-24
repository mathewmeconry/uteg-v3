import { useTranslation } from 'react-i18next';
import { FormField } from './FormField';

/** For the code in a mail. */
export function CodeField({ error, className }: { error?: string; className?: string }) {
  const { t } = useTranslation('auth');

  return (
    <FormField
      label={t('verify.code')}
      error={error}
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      className={className}
      required
    />
  );
}
