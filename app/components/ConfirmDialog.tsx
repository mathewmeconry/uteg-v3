import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useActionFetcher } from '~/hooks/useActionFetcher';

/**
 * Asks before posting `fields` to `action` (default: the current route). Closes when it worked,
 * see useActionFetcher for failures. Redirects of the action are followed. An array value is sent
 * as repeated fields.
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { Form, pending } = useActionFetcher(() => setOpen(false));

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild ref={triggerRef}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (triggerRef.current) return;
          // It was deleted together with its trigger.
          event.preventDefault();
          document.querySelector<HTMLElement>('#content h1')?.focus();
        }}
      >
        <Form method="post" action={action}>
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
            <AlertDialogCancel type="button" disabled={pending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <SubmitButton pending={pending} variant={destructive ? 'destructive' : 'default'}>
              {confirmLabel}
            </SubmitButton>
          </AlertDialogFooter>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
