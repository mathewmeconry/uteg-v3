import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import type { DivisionState } from '~/generated/prisma/enums';
import { cn } from '~/lib/utils';

const STYLES: Record<DivisionState, string> = {
  PENDING: 'bg-secondary text-secondary-foreground',
  RUNNING: 'bg-success text-success-foreground',
  ENDED: 'bg-foreground text-background',
};

export function DivisionStateBadge({ state }: { state: DivisionState }) {
  const { t } = useTranslation();
  return <Badge className={cn(STYLES[state])}>{t(`divisionState.${state}`)}</Badge>;
}
