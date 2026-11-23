import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import type { Route } from './+types/display';
import { AccessGate } from '~/components/AccessGate';
import { StubPage } from '~/components/StubPage';
import { TokenErrorBoundary } from '~/components/TokenErrorBoundary';
import { resolveAccess } from '~/lib/access.server';

export async function loader({ request, params: { linkId } }: Route.LoaderArgs) {
  const link = await resolveAccess(request, linkId, 'DISPLAY');
  if (!link) throw data(null, 403);
  return { ground: link.ground };
}

export default function Display() {
  const { t } = useTranslation('display');
  return (
    <AccessGate>
      <main id="content" className="p-4">
        <StubPage title={t('screenTitle')} />
      </main>
    </AccessGate>
  );
}

export const ErrorBoundary = TokenErrorBoundary;
