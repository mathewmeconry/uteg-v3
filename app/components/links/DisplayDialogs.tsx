import { PlusIcon, QrCodeIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '~/components/CopyButton';
import { FormField } from '~/components/FormField';
import { QrCode } from '~/components/QrCode';
import { SubmitButton } from '~/components/SubmitButton';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { useActionFetcher } from '~/hooks/useActionFetcher';

export function CreateDisplayDialog({ grounds }: { grounds: number }) {
  const { t } = useTranslation(['display', 'common']);
  const [open, setOpen] = useState(false);
  const { Form, pending } = useActionFetcher(() => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          {t('links.create')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" className="grid gap-4">
          <input type="hidden" name="intent" value="create" />
          <DialogHeader>
            <DialogTitle>{t('links.create')}</DialogTitle>
            <DialogDescription>{t('links.intro')}</DialogDescription>
          </DialogHeader>
          <FormField label={t('common:fields.ground')}>
            {(props) => (
              <Select name="ground" defaultValue="1">
                <SelectTrigger {...props} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: grounds }, (_, index) => (
                    <SelectItem key={index} value={String(index + 1)}>
                      {t('common:ground', { number: index + 1 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <DialogFooter>
            <SubmitButton pending={pending}>{t('common:actions.create')}</SubmitButton>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function QrDialog({ name, url }: { name: string; url: string }) {
  const { t } = useTranslation(['display', 'common']);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t('links.qrFor', { name })}>
          <QrCodeIcon aria-hidden />
          {t('links.qr')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription className="break-all">{url}</DialogDescription>
        </DialogHeader>
        <QrCode
          value={url}
          label={t('links.qrFor', { name })}
          className="size-72 max-w-full justify-self-center"
        />
        <CopyButton value={url} label={t('links.copy')} />
      </DialogContent>
    </Dialog>
  );
}
