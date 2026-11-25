import { KeyRoundIcon, LogOutIcon, Trash2Icon } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { StatusBadge } from '~/components/StatusBadge';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { Role } from '~/generated/prisma/enums';
import { formatDate } from '~/lib/format';

export function UserRow({
  user: { id, email, emailVerified, isAdmin, createdAt, lastActive, memberships },
  isSelf,
}: {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    isAdmin: boolean;
    createdAt: Date;
    lastActive: Date | null;
    memberships: { role: Role; competition: { id: string; name: string } }[];
  };
  isSelf: boolean;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'settings']);

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          <span className="min-w-0 wrap-anywhere">{email}</span>
          {isSelf && <Badge variant="secondary">{t('settings:members.you')}</Badge>}
          {isAdmin && <Badge variant="outline">{t('admin')}</Badge>}
          {!emailVerified && <StatusBadge tone="warning">{t('unverified')}</StatusBadge>}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('registered', { date: formatDate(createdAt, i18n.language) })}
          {' · '}
          {lastActive
            ? t('lastActive', { date: formatDate(lastActive, i18n.language) })
            : t('signedOut')}
        </p>
        {memberships.length > 0 && (
          <p className="text-sm wrap-anywhere text-muted-foreground">
            {memberships.map(({ role, competition }, index) => (
              <Fragment key={competition.id}>
                {index > 0 && ', '}
                <Link
                  to={`/competitions/${competition.id}`}
                  className="text-primary underline underline-offset-4"
                >
                  {competition.name}
                </Link>{' '}
                ({t(`common:role.${role}`)})
              </Fragment>
            ))}
          </p>
        )}
      </div>
      {!isSelf && (
        <div className="flex items-center gap-1">
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                title={t('resetPassword.title')}
                aria-label={t('resetPassword.label', { email })}
              >
                <KeyRoundIcon aria-hidden />
              </Button>
            }
            title={t('resetPassword.confirm', { email })}
            description={t('resetPassword.text')}
            confirmLabel={t('resetPassword.button')}
            fields={{ intent: 'resetPassword', userId: id }}
          />
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                disabled={!lastActive}
                title={t('signOut.title')}
                aria-label={t('signOut.label', { email })}
              >
                <LogOutIcon aria-hidden />
              </Button>
            }
            title={t('signOut.confirm', { email })}
            description={t('signOut.text')}
            confirmLabel={t('signOut.button')}
            fields={{ intent: 'signOut', userId: id }}
          />
          {!isAdmin && (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('delete.title')}
                  aria-label={t('delete.label', { email })}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              }
              title={t('delete.confirm', { email })}
              description={t('delete.text')}
              confirmLabel={t('common:actions.delete')}
              destructive
              fields={{ intent: 'delete', userId: id }}
            />
          )}
        </div>
      )}
    </li>
  );
}
