import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '~/components/ui/input-otp';
import { FormField } from './FormField';

const LENGTH = 6;

/** For the code in a mail. Pass the errors of the action, each answer is a new object. */
export function CodeField({ errors }: { errors?: { [name: string]: string | undefined } }) {
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [lastErrors, setLastErrors] = useState(errors);
  if (errors !== lastErrors) {
    // A full field takes no other code.
    setLastErrors(errors);
    setCode('');
  }

  return (
    <FormField label={t('verify.code')} error={errors?.code}>
      {(props) => (
        <InputOTP
          {...props}
          name="code"
          value={code}
          onChange={setCode}
          maxLength={LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          required
        >
          <InputOTPGroup>
            {Array.from({ length: LENGTH }, (_, index) => (
              <InputOTPSlot
                key={index}
                index={index}
                aria-invalid={props['aria-invalid']}
                className="size-12 text-lg"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      )}
    </FormField>
  );
}
