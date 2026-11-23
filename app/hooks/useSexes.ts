import { useRouteLoaderData } from 'react-router';
import { SEXES, type Sex } from '~/modules/types';
import type { loader } from '~/routes/secured/competition/layout';

/** Who takes part in the competition. With one there is nothing to choose. */
export function useSexes(): readonly Sex[] {
  const data = useRouteLoaderData<typeof loader>('routes/secured/competition/layout');
  return data?.competition.sexes ?? SEXES;
}
