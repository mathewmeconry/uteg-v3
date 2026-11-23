import { LogOutIcon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { Role } from '~/generated/prisma/enums';
import { RoleSelect } from './RoleSelect';

export function MemberRow({
  member: { userId, email, role },
  isSelf,
  isLastOwner,
  canManage,
}: {
  member: { userId: string; email: string; role: Role };
  isSelf: boolean;
  isLastOwner: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const fetcher = useFetcher();
  const pendingRole = fetcher.formData?.get('role') as Role | undefined;
  const roleSelect = useRef<HTMLButtonElement>(null);
  const [ownNewRole, setOwnNewRole] = useState<Role>();

  function changeRole(newRole: Role) {
    void fetcher.submit({ intent: 'role', userId, role: newRole }, { method: 'post' });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{email}</span>
          {isSelf && <Badge variant="secondary">{t('members.you')}</Badge>}
        </p>
        {canManage && isLastOwner && (
          <p className="text-sm text-muted-foreground">{t('members.lastOwner')}</p>
        )}
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <RoleSelect
            value={pendingRole ?? role}
            ref={roleSelect}
            disabled={isLastOwner}
            aria-label={t('members.roleOf', { email })}
            className="w-36"
            // Only owners can change roles, so they cannot take it back.
            onChange={isSelf ? setOwnNewRole : changeRole}
          />
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                disabled={isLastOwner}
                aria-label={isSelf ? t('members.leave') : t('members.remove', { email })}
              >
                {isSelf ? <LogOutIcon aria-hidden /> : <Trash2Icon aria-hidden />}
              </Button>
            }
            title={isSelf ? t('members.leaveTitle') : t('members.removeTitle', { email })}
            description={isSelf ? t('members.leaveText') : t('members.removeText')}
            confirmLabel={isSelf ? t('members.leave') : t('common:actions.remove')}
            destructive
            fields={{ intent: 'remove', userId }}
          />
        </div>
      ) : (
        <Badge variant="outline">{t(`common:role.${role}`)}</Badge>
      )}

      <AlertDialog
        open={ownNewRole !== undefined}
        onOpenChange={(open) => {
          if (!open) setOwnNewRole(undefined);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Without a trigger the dialog does not know where the focus was.
            event.preventDefault();
            roleSelect.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('members.demoteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('members.demoteText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => changeRole(ownNewRole!)}>
              {t('members.demote')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
