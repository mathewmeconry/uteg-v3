import { useRouteLoaderData } from 'react-router';
import { can, type Permission } from '~/lib/roles';
import type { loader } from '~/routes/secured/competition/layout';

/** The competition, its contests and what the user may do. Only below the competition layout. */
export function useCompetition() {
  const data = useRouteLoaderData<typeof loader>('routes/secured/competition/layout');
  if (!data) throw new Error('useCompetition needs a competition route');
  return { ...data, can: (permission: Permission) => can(data.role, permission) };
}
