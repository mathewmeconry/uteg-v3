import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';

/** Deletes the competition once its name was typed. The server checks the name again. */
export function DeleteCompetitionDialog({ name }: { name: string }) {
  const { t } = useTranslation(['settings', 'common']);
  const fetcher = useFetcher<{ errors?: { confirmName?: string } }>();
  const [typed, setTyped] = useState('');

  return (
    <AlertDialog onOpenChange={() => setTyped('')}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {t('delete.title')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <fetcher.Form method="post" className="grid gap-6">
          <input type="hidden" name="intent" value="delete" />
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('delete.text')}</AlertDialogDescription>
          </AlertDialogHeader>
          <FormField
            label={
              <span className="min-w-0 wrap-anywhere">{t('delete.confirmName', { name })}</span>
            }
            error={fetcher.data?.errors?.confirmName}
            name="confirmName"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t('common:actions.cancel')}</AlertDialogCancel>
            <SubmitButton
              variant="destructive"
              pending={fetcher.state !== 'idle'}
              disabled={typed.trim() !== name}
            >
              {t('delete.button')}
            </SubmitButton>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
