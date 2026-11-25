import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, redirect } from 'react-router';
import type { Route } from './+types/users';
import { SearchInput } from '~/components/admin/SearchInput';
import { UserRow } from '~/components/admin/UserRow';
import { deleteUser, endSessions, getUserEmail, listUsers } from '~/lib/admin.server';
import { callAuth, getUser } from '~/lib/auth/auth.server';
import { actionError } from '~/lib/domainErrors.server';
import { safeClientAction } from '~/lib/safeClientAction';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function loader({ context }: Route.LoaderArgs) {
  return { users: await listUsers(), ownId: getUser(context).id };
}

// Only admins get here, see adminMiddleware of the layout.
export async function action({ request, context }: Route.ActionArgs) {
  const t = getT(context);
  const formData = await request.formData();
  const userId = String(formData.get('userId'));

  try {
    switch (formData.get('intent')) {
      case 'resetPassword': {
        const email = await getUserEmail(userId);
        const response = await callAuth(request, '/request-password-reset', { email });
        if (response.status === 429) {
          return data({ error: t('errors.tooManyRequests') }, 429);
        }
        if (!response.ok) return data({ error: t('errors.generic') }, 500);
        enqueueToast(context, { type: 'success', message: t('admin:resetPassword.done') });
        return redirect('.');
      }

      case 'signOut':
        await endSessions(userId);
        enqueueToast(context, { type: 'success', message: t('admin:signOut.done') });
        return redirect('.');

      case 'delete':
        await deleteUser(userId);
        enqueueToast(context, { type: 'success', message: t('admin:delete.done') });
        return redirect('.');
    }
  } catch (error) {
    return actionError(error, t);
  }
  throw data(null, 400);
}

export const clientAction = safeClientAction;

export default function AdminUsers({ loaderData: { users, ownId } }: Route.ComponentProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [search, setSearch] = useState('');
  const text = search.trim().toLowerCase();
  const found = users.filter(
    ({ email, memberships }) =>
      email.includes(text) ||
      memberships.some(({ competition }) => competition.name.toLowerCase().includes(text)),
  );

  return (
    <>
      <title>{`${t('users')} · ${t('title')} · UTEG`}</title>
      <SearchInput value={search} onChange={setSearch} placeholder={t('searchUsers')} />
      {found.length === 0 ? (
        <p className="text-muted-foreground">{t('common:noResults')}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card px-4">
          {found.map((user) => (
            <UserRow key={user.id} user={user} isSelf={user.id === ownId} />
          ))}
        </ul>
      )}
    </>
  );
}
