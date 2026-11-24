import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, redirect, useNavigation } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/members';
import { MemberRow } from '~/components/competition/MemberRow';
import { ROLES, RoleSelect } from '~/components/competition/RoleSelect';
import { FormField } from '~/components/FormField';
import { PageHeader } from '~/components/PageHeader';
import { SubmitButton } from '~/components/SubmitButton';
import { competitionContext } from '~/context';
import { Role } from '~/generated/prisma/enums';
import { useActionErrors } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { getUser } from '~/lib/auth/auth.server';
import { addMember, changeMemberRole, listMembers, removeMember } from '~/lib/competitions.server';
import { actionError, domainErrorMessage } from '~/lib/domainErrors.server';
import { parseForm } from '~/lib/forms.server';
import { safeClientAction } from '~/lib/safeClientAction';
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
        return actionError(error, t);
      }
      enqueueToast(context, { type: 'success', message: t('settings:members.roleChanged') });
      return redirect('.');
    }

    case 'remove': {
      const userId = String(formData.get('userId'));
      try {
        await removeMember(id, userId);
      } catch (error) {
        return actionError(error, t);
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

export const clientAction = safeClientAction;

export default function Members({
  loaderData: { members, ownId },
  actionData,
}: Route.ComponentProps) {
  const { t } = useTranslation(['settings', 'common']);
  const { isOwner } = useCompetition();
  const errors = useActionErrors(actionData);
  const owners = members.filter(({ role }) => role === 'OWNER').length;

  const { state } = useNavigation();
  const emailInput = useRef<HTMLInputElement>(null);
  const isAdding = useRef(false);
  useEffect(() => {
    // The button was disabled meanwhile. To correct the address or to add the next member.
    if (state !== 'idle' || !isAdding.current) return;
    isAdding.current = false;
    emailInput.current?.focus();
  }, [state]);

  return (
    <>
      <title>{`${t('membersTitle')} · UTEG`}</title>
      <PageHeader title={t('membersTitle')} />
      <div className="grid max-w-5xl grid-cols-1 items-start gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid grid-cols-1 gap-7">
          <ul className="divide-y rounded-xl border bg-card px-4">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                canManage={isOwner}
                isSelf={member.userId === ownId}
                isLastOwner={member.role === 'OWNER' && owners === 1}
              />
            ))}
          </ul>

          {isOwner && (
            <section aria-labelledby="add-title">
              <h2 id="add-title" className="mb-3 font-display text-lg">
                {t('members.addTitle')}
              </h2>
              {/* The key clears the form once the member was added. */}
              <Form
                key={members.length}
                method="post"
                onSubmit={() => {
                  isAdding.current = true;
                }}
                className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
              >
                <FormField
                  label={t('common:fields.email')}
                  hint={t('members.addHint')}
                  error={errors.email}
                  ref={emailInput}
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
                <SubmitButton name="intent" value="add" className="justify-self-start sm:mt-7">
                  {t('common:actions.add')}
                </SubmitButton>
              </Form>
            </section>
          )}
        </div>

        <section aria-labelledby="roles-title" className="text-sm">
          <h2 id="roles-title" className="mb-3 font-display text-lg">
            {t('members.rolesTitle')}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-1">
            {ROLES.toReversed().map((role) => (
              <div key={role}>
                <dt className="font-semibold">{t(`common:role.${role}`)}</dt>
                <dd className="text-muted-foreground">{t(`members.roleText.${role}`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
