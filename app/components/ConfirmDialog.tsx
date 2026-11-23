import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
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

/**
 * Asks before posting `fields` to `action` (default: the current route). Redirects of the action
 * are followed. An array value is sent as repeated fields.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  action,
  fields = {},
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  destructive?: boolean;
  action?: string;
  fields?: Record<string, string | string[]>;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild disabled={fetcher.state !== 'idle'}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <fetcher.Form method="post" action={action} onSubmit={() => setOpen(false)}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription className={description ? undefined : 'sr-only'}>
              {description ?? title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {Object.entries(fields).flatMap(([name, value]) =>
            [value]
              .flat()
              .map((item) => (
                <input key={`${name}-${item}`} type="hidden" name={name} value={item} />
              )),
          )}
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel type="button">{t('actions.cancel')}</AlertDialogCancel>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
