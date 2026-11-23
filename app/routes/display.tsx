import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import type { Route } from './+types/display';
import { StubPage } from '~/components/StubPage';
import { TokenErrorBoundary } from '~/components/TokenErrorBoundary';
import { resolveToken } from '~/lib/access.server';

export async function loader({ params: { token } }: Route.LoaderArgs) {
  const link = await resolveToken(token, 'DISPLAY');
  if (!link) throw data(null, 404);
  return { ground: link.ground };
}

export default function Display() {
  const { t } = useTranslation('display');
  return (
    <main id="content" className="p-4">
      <StubPage title={t('screenTitle')} />
    </main>
  );
}

export const ErrorBoundary = TokenErrorBoundary;
