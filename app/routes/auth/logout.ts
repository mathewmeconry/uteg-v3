import { redirect } from 'react-router';
import type { Route } from './+types/logout';
import { authCookies, callAuth } from '~/lib/auth/auth.server';

export function loader() {
  return redirect('/');
}

export async function action({ request }: Route.ActionArgs) {
  const response = await callAuth(request, '/sign-out', {});
  return redirect('/login', { headers: authCookies(response) });
}
