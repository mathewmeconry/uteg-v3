import { MailIcon, Trash2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { Role } from '~/generated/prisma/enums';

export function InvitationRow({
  invitation: { id, email, role },
  canManage,
}: {
  invitation: { id: string; email: string; role: Role };
  canManage: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <MailIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-semibold">{email}</p>
        <p className="text-sm text-muted-foreground">{t('members.pending')}</p>
      </div>
      <div className="flex items-center gap-1 max-sm:ml-12">
        <Badge variant="outline">{t(`common:role.${role}`)}</Badge>
        {canManage && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label={t('members.withdraw', { email })}>
                <Trash2Icon aria-hidden />
              </Button>
            }
            title={t('members.withdrawTitle', { email })}
            description={t('members.withdrawText')}
            confirmLabel={t('common:actions.remove')}
            destructive
            fields={{ intent: 'withdraw', invitationId: id }}
          />
        )}
      </div>
    </li>
  );
}
