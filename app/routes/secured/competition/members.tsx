import { LogOutIcon, Trash2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, redirect, useFetcher } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/members';
import { ROLES, RoleSelect } from '~/components/competition/RoleSelect';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { FormField } from '~/components/FormField';
import { PageHeader } from '~/components/PageHeader';
import { SubmitButton } from '~/components/SubmitButton';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { competitionContext } from '~/context';
import { Role } from '~/generated/prisma/enums';
import { useCompetition } from '~/hooks/useCompetition';
import { getUser } from '~/lib/auth/auth.server';
import { addMember, changeMemberRole, listMembers, removeMember } from '~/lib/competitions.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { parseForm } from '~/lib/forms.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function loader({ context }: Route.LoaderArgs) {
  const members = await listMembers(context.get(competitionContext).id);
  return {
    members: members.map(({ userId, role, user }) => ({ userId, email: user.email, role })),
    ownId: getUser(context).id,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'OWNER');
  const t = getT(context);
  const formData = await request.formData();

  switch (formData.get('intent')) {
    case 'add': {
      const { data: values, errors } = parseForm(
        formData,
        z.object({
          email: z
            .string()
            .trim()
            .pipe(z.email(t('settings:members.emailInvalid'))),
          role: z.enum(Role),
        }),
      );
      if (errors) return data({ errors }, 400);
      try {
        await addMember(id, values);
      } catch (error) {
        return data({ errors: { email: domainErrorMessage(error, t) } }, 400);
      }
      enqueueToast(context, { type: 'success', message: t('settings:members.added') });
      return redirect('.');
    }

    case 'role': {
      const { data: values, errors } = parseForm(
        formData,
        z.object({ userId: z.string(), role: z.enum(Role) }),
      );
      if (errors) throw data(null, 400);
      try {
        await changeMemberRole(id, values.userId, values.role);
      } catch (error) {
        enqueueToast(context, { type: 'error', message: domainErrorMessage(error, t) });
        return data(null, 400);
      }
      enqueueToast(context, { type: 'success', message: t('settings:members.roleChanged') });
      return redirect('.');
    }

    case 'remove': {
      const userId = String(formData.get('userId'));
      try {
        await removeMember(id, userId);
      } catch (error) {
        enqueueToast(context, { type: 'error', message: domainErrorMessage(error, t) });
        return data(null, 400);
      }
      const left = userId === getUser(context).id;
      const message = t(left ? 'settings:members.left' : 'settings:members.removed');
      enqueueToast(context, { type: 'success', message });
      return redirect(left ? '/home' : '.');
    }

    default:
      throw data(null, 400);
  }
}

type Member = Route.ComponentProps['loaderData']['members'][number];

function MemberRow({
  member: { userId, email, role },
  isSelf,
  isLastOwner,
}: {
  member: Member;
  isSelf: boolean;
  isLastOwner: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const { isOwner } = useCompetition();
  const fetcher = useFetcher();
  const pendingRole = fetcher.formData?.get('role') as Role | undefined;

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{email}</span>
          {isSelf && <Badge variant="secondary">{t('members.you')}</Badge>}
        </p>
        {isOwner && isLastOwner && (
          <p className="text-sm text-muted-foreground">{t('members.lastOwner')}</p>
        )}
      </div>
      {isOwner ? (
        <div className="flex items-center gap-2">
          <RoleSelect
            value={pendingRole ?? role}
            disabled={isLastOwner || fetcher.state !== 'idle'}
            aria-label={t('members.roleOf', { email })}
            className="w-36"
            onChange={(newRole) =>
              void fetcher.submit({ intent: 'role', userId, role: newRole }, { method: 'post' })
            }
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
    </li>
  );
}

export default function Members({
  loaderData: { members, ownId },
  actionData,
}: Route.ComponentProps) {
  const { t } = useTranslation(['settings', 'common']);
  const { isOwner } = useCompetition();
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};
  const owners = members.filter(({ role }) => role === 'OWNER').length;

  return (
    <>
      <title>{`${t('membersTitle')} · UTEG`}</title>
      <PageHeader title={t('membersTitle')} />
      <div className="grid max-w-3xl gap-6">
        <Card className="py-2">
          <CardContent>
            <ul className="divide-y">
              {members.map((member) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  isSelf={member.userId === ownId}
                  isLastOwner={member.role === 'OWNER' && owners === 1}
                />
              ))}
            </ul>
          </CardContent>
        </Card>

        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle>{t('members.addTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* The key clears the form once the member was added. */}
              <Form key={members.length} method="post" className="grid gap-4">
                <div className="grid items-start gap-4 sm:grid-cols-[1fr_11rem]">
                  <FormField
                    label={t('common:fields.email')}
                    hint={t('members.addHint')}
                    error={errors.email}
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                  />
                  <FormField label={t('members.role')}>
                    {(props) => (
                      <RoleSelect {...props} name="role" defaultValue="EDITOR" className="w-full" />
                    )}
                  </FormField>
                </div>
                <SubmitButton name="intent" value="add" className="justify-self-start">
                  {t('common:actions.add')}
                </SubmitButton>
              </Form>
            </CardContent>
          </Card>
        )}

        <dl className="grid gap-2 text-sm">
          {ROLES.toReversed().map((role) => (
            <div key={role} className="grid sm:grid-cols-[8rem_1fr]">
              <dt className="font-medium">{t(`common:role.${role}`)}</dt>
              <dd className="text-muted-foreground">{t(`members.roleText.${role}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
