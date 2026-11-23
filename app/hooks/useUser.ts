import { useRouteLoaderData } from 'react-router';
import type { loader } from '~/routes/secured/layout';

/** The signed-in user. Only below routes/secured/layout. */
export function useUser() {
  const user = useRouteLoaderData<typeof loader>('routes/secured/layout');
  if (!user) throw new Error('useUser needs a secured route');
  return user;
}
