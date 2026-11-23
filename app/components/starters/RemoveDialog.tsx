import { useEffect, useRef } from 'react';
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
import type { clientAction } from '~/routes/secured/competition/starters';
import { FormAlert } from './FormAlert';
import { useActionError } from './keepPage';
import { fullName, type StarterRow } from './starterRow';
import { useReturnFocus } from './useReturnFocus';

const MAX_NAMES = 10;

/** Asks before removing starters. Render it while it is open. */
export function RemoveDialog({
  starters,
  onClose,
  onRemoved,
  focusAfterwards,
}: {
  starters: StarterRow[];
  onClose: () => void;
  onRemoved: () => void;
  /** Moves the focus once the dialog is gone. The button that opened it may be gone as well. */
  focusAfterwards?: () => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const fetcher = useFetcher<typeof clientAction>();
  const returnFocus = useReturnFocus();
  const error = useActionError(fetcher.data);
  const isDone = Boolean(fetcher.data && 'ok' in fetcher.data);
  const isRemoved = useRef(false);
  const more = starters.length - MAX_NAMES;

  useEffect(() => {
    if (!isDone) return;
    isRemoved.current = true;
    onRemoved();
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once
  }, [isDone]);

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (!isRemoved.current) return returnFocus(event);
          event.preventDefault();
          focusAfterwards?.();
        }}
      >
        <fetcher.Form method="post" className="grid gap-4">
          <input type="hidden" name="intent" value="remove" />
          {starters.map(({ id }) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <AlertDialogHeader>
            <AlertDialogTitle>{t('remove.title', { count: starters.length })}</AlertDialogTitle>
            <AlertDialogDescription>{t('remove.text')}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && fetcher.state === 'idle' && <FormAlert message={error} />}
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
