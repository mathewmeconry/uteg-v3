import { CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '~/components/StatusBadge';
import type { DivisionState } from '~/generated/prisma/enums';

const TONES: Record<DivisionState, StatusTone> = {
  PENDING: 'neutral',
  RUNNING: 'live',
  ENDED: 'done',
};

export function DivisionStateBadge({ state }: { state: DivisionState }) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={TONES[state]} icon={state === 'ENDED' ? CheckIcon : undefined}>
      {t(`divisionState.${state}`)}
    </StatusBadge>
  );
}
