import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import type { Route } from './+types/judge';
import { AccessGate } from '~/components/AccessGate';
import { StubPage } from '~/components/StubPage';
import { TokenErrorBoundary } from '~/components/TokenErrorBoundary';
import { resolveAccess } from '~/lib/access.server';

export async function loader({ request, params: { linkId } }: Route.LoaderArgs) {
  const link = await resolveAccess(request, linkId, 'JUDGE');
  if (!link) throw data(null, 403);
  return { ground: link.ground, apparatus: link.apparatus };
}

export default function Judge() {
  const { t } = useTranslation('judging');
  return (
    <AccessGate>
      <main id="content" className="p-4">
        <StubPage title={t('title')} />
      </main>
    </AccessGate>
  );
}

export const ErrorBoundary = TokenErrorBoundary;
