import { LoaderCircleIcon, WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectionStatus } from '~/hooks/useLiveUpdates';
import { cn } from '~/lib/utils';

/** Shows the status returned by useLiveUpdates. Only loud when the connection is lost. */
export function ConnectionBadge({
  status,
  onInk = false,
}: {
  status: ConnectionStatus;
  /** On an ink surface. */
  onInk?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      className={cn(
        'inline-flex h-7 w-fit items-center gap-1.5 rounded-sm text-sm whitespace-nowrap text-muted-foreground [&>svg]:size-4',
        onInk && 'text-ink-muted',
        status === 'lost' &&
          (onInk
            ? 'bg-warning px-2.5 font-semibold text-warning-foreground'
            : 'bg-destructive px-2 font-semibold text-destructive-foreground'),
      )}
    >
      {status === 'open' && (
        <span
          aria-hidden
          className={cn('size-2 rounded-full', onInk ? 'bg-brand' : 'bg-success')}
        />
      )}
      {status === 'connecting' && <LoaderCircleIcon aria-hidden className="animate-spin" />}
      {status === 'lost' && <WifiOffIcon aria-hidden />}
      {t(`connection.${status}`)}
    </span>
  );
}
