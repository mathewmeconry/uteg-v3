import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { SubmitButton } from '~/components/SubmitButton';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import type { Sex } from '~/generated/prisma/enums';

/** Give it a key of category and saved value, so it starts over when they change. */
export function HonourForm({
  sex,
  category,
  percent,
  hint,
}: {
  sex: Sex;
  category: string;
  percent: number;
  hint: string;
}) {
  const { t } = useTranslation(['ranking', 'common']);
  const id = useId();
  const fetcher = useFetcher<{ errors?: { percent?: string } }>();
  const [value, setValue] = useState(String(percent));
  const [submitted, setSubmitted] = useState<string>();
  const error = value === submitted ? fetcher.data?.errors?.percent : undefined;
  const isChanged = value.trim() === '' || Number(value.replace(',', '.')) !== percent;

  return (
    <fetcher.Form
      method="post"
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      onSubmit={() => setSubmitted(value)}
    >
      <input type="hidden" name="sex" value={sex} />
      <input type="hidden" name="category" value={category} />
      <Label htmlFor={id} className="font-normal">
        {t('honourPercent')}
      </Label>
      <Input
        id={id}
        name="percent"
        inputMode="decimal"
        autoComplete="off"
        className="w-16 text-center tabular-nums"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
      />
      {isChanged && (
        <SubmitButton size="sm" pending={fetcher.state !== 'idle'}>
          {t('common:actions.save')}
        </SubmitButton>
      )}
      <p
        id={`${id}-hint`}
        role={error ? 'alert' : undefined}
        className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
      >
        {error ?? hint}
      </p>
    </fetcher.Form>
  );
}
