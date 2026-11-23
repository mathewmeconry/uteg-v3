import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { SubmitButton } from '~/components/SubmitButton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import type { action } from '~/routes/secured/competition/starters';
import { fullName, type StarterRow } from './starterRow';

const MAX_NAMES = 10;

/** Asks before removing starters. Render it while it is open. */
export function RemoveDialog({
  starters,
  onClose,
}: {
  starters: StarterRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const fetcher = useFetcher<typeof action>();
  const isDone = Boolean(fetcher.data);
  const more = starters.length - MAX_NAMES;

  useEffect(() => {
    if (isDone) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once
  }, [isDone]);

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <fetcher.Form method="post" className="grid gap-4">
          <input type="hidden" name="intent" value="remove" />
          {starters.map(({ id }) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <AlertDialogHeader>
            <AlertDialogTitle>{t('remove.title', { count: starters.length })}</AlertDialogTitle>
            <AlertDialogDescription>{t('remove.text')}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc pl-5 text-sm">
            {starters.slice(0, MAX_NAMES).map((starter) => (
              <li key={starter.id}>
                {fullName(starter)}, {starter.club.name}
              </li>
            ))}
            {more > 0 && <li>{t('remove.more', { count: more })}</li>}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t('common:actions.cancel')}</AlertDialogCancel>
            <SubmitButton variant="destructive" pending={fetcher.state !== 'idle'}>
              {t('common:actions.remove')}
            </SubmitButton>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
