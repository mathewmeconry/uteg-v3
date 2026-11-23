import { LoaderCircleIcon, WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectionStatus } from '~/hooks/useLiveUpdates';
import { cn } from '~/lib/utils';

/** Shows the status returned by useLiveUpdates. Only loud when the connection is lost. */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      className={cn(
        'inline-flex h-7 w-fit items-center gap-1.5 rounded-sm text-sm whitespace-nowrap text-muted-foreground [&>svg]:size-4',
        status === 'lost' && 'bg-destructive px-2 font-semibold text-white dark:bg-destructive/60',
      )}
    >
      {status === 'open' && <span aria-hidden className="size-2 rounded-full bg-success" />}
      {status === 'connecting' && <LoaderCircleIcon aria-hidden className="animate-spin" />}
      {status === 'lost' && <WifiOffIcon aria-hidden />}
      {t(`connection.${status}`)}
    </span>
  );
}
