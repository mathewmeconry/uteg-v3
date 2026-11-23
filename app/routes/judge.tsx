import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import type { Route } from './+types/judge';
import { StubPage } from '~/components/StubPage';
import { TokenErrorBoundary } from '~/components/TokenErrorBoundary';
import { resolveToken } from '~/lib/access.server';

export async function loader({ params: { token } }: Route.LoaderArgs) {
  const link = await resolveToken(token, 'JUDGE');
  if (!link) throw data(null, 404);
  return { ground: link.ground, apparatus: link.apparatus };
}

export default function Judge() {
  const { t } = useTranslation('judging');
  return (
    <main id="content" className="p-4">
      <StubPage title={t('title')} />
    </main>
  );
}

export const ErrorBoundary = TokenErrorBoundary;
