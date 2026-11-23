import { ExternalLinkIcon, FileTextIcon, RotateCcwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { CopyButton } from '~/components/CopyButton';
import { QrCode } from '~/components/QrCode';
import { Button } from '~/components/ui/button';
import type de from '~/locales/de/common';

type JudgeLink = { id: string; ground: number; apparatus: string; url: string };

export function JudgeLinkCard({ link, manualUrl }: { link: JudgeLink; manualUrl: string }) {
  const { t } = useTranslation(['judging', 'common']);
  const apparatus = t(`common:apparatus.${link.apparatus as keyof typeof de.apparatus}`);
  const name = `${apparatus}, ${t('common:ground', { number: link.ground })}`;

  return (
    <li className="flex flex-col items-center gap-3 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold">{apparatus}</h2>
      <QrCode value={link.url} label={t('links.qr', { name })} className="size-52" />
      <div className="grid w-full grid-cols-2 gap-2">
        <Button asChild>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            aria-label={t('links.open', { name })}
          >
            <ExternalLinkIcon aria-hidden />
            {t('common:actions.open')}
          </a>
        </Button>
        <CopyButton value={link.url} aria-label={t('links.copyFor', { name })} />
        <Button asChild variant="outline" className="col-span-2">
          <a
            href={manualUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t('links.manualFor', { name })}
          >
            <FileTextIcon aria-hidden />
            {t('links.manual')}
          </a>
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              variant="ghost"
              className="col-span-2"
              aria-label={t('links.resetFor', { name })}
            >
              <RotateCcwIcon aria-hidden />
              {t('common:actions.reset')}
            </Button>
          }
          title={t('links.resetTitle')}
          description={t('links.resetText', { name })}
          confirmLabel={t('common:actions.reset')}
          destructive
          fields={{ intent: 'reset', link: link.id }}
        />
      </div>
    </li>
  );
}
