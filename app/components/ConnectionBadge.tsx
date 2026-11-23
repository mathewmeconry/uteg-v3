import { LoaderCircleIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import type { ConnectionStatus } from '~/hooks/useLiveUpdates';

const ICONS = { connecting: LoaderCircleIcon, open: WifiIcon, lost: WifiOffIcon };

/** Shows the status returned by useLiveUpdates. */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  const Icon = ICONS[status];
  return (
    <Badge role="status" variant={status === 'lost' ? 'destructive' : 'outline'}>
      <Icon aria-hidden className={status === 'connecting' ? 'animate-spin' : undefined} />
      {t(`connection.${status}`)}
    </Badge>
  );
}
