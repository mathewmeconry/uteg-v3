import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import type { Route } from './+types/judge';
import { AccessGate } from '~/components/AccessGate';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { ScreenControls } from '~/components/judging/ScreenControls';
import { Tablet } from '~/components/judging/Tablet';
import { TokenErrorBoundary } from '~/components/TokenErrorBoundary';
import { useApparatusName } from '~/hooks/useApparatusName';
import { useFontScale } from '~/hooks/useFontScale';
import { useIsOnline } from '~/hooks/useIsOnline';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { useWakeLock } from '~/hooks/useWakeLock';
import { resolveAccess } from '~/lib/access.server';
import { getJudgingState } from '~/lib/judging.server';
import { createLastData } from '~/lib/lastData';

export async function loader({ request, params: { linkId } }: Route.LoaderArgs) {
  const link = await resolveAccess(request, linkId, 'JUDGE');
  if (!link?.apparatus) throw data(null, 403);
  const { competitionId, ground, apparatus } = link;

  // Before loading, so everything saved earlier is part of the data.
  const loadedAt = Date.now();
  const state = await getJudgingState(competitionId, ground, apparatus);
  const [own] = state.apparatus;
  return {
    competitionName: link.competition.name,
    ground,
    tablet: {
      ...own,
      loadedAt,
      divisions: state.divisions.filter(({ progress }) => apparatus in progress),
      endedIds: state.endedIds,
      rounds: own.rounds.map(({ round, slots }) => ({
        round,
        slots: slots.map((slot) => ({ ...slot, apparatus })),
      })),
    },
  };
}

const lastData = createLastData<Awaited<ReturnType<typeof loader>>>();

export function clientLoader({ params: { linkId }, serverLoader }: Route.ClientLoaderArgs) {
  return lastData.load(linkId, serverLoader);
}

export default function Judge({ loaderData, params: { linkId } }: Route.ComponentProps) {
  const { competitionName, ground, tablet } = loaderData;
  useEffect(() => lastData.remember(linkId, loaderData), [linkId, loaderData]);

  const { t } = useTranslation(['judging', 'common']);
  const api = `/api/judge/${linkId}`;
  const stream = useLiveUpdates(`${api}/events`);
  const status = useIsOnline() ? stream : 'lost';
  const { scale, change } = useFontScale('judge-font-scale');
  useWakeLock();

  // Everything is sized in rem, also what is rendered outside of this page.
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale * 100}%`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [scale]);

  const apparatus = useApparatusName()(tablet.apparatus);
  return (
    <AccessGate>
      <div className="min-h-svh">
        <title>{`${apparatus} · UTEG`}</title>
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background px-4 py-2">
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-black">{apparatus}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {t('common:ground', { number: ground })} · {competitionName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionBadge status={status} />
            <ScreenControls scale={scale} onScale={change} />
          </div>
        </header>
        <main id="content" className="p-4">
          <Tablet
            key={linkId}
            linkId={linkId}
            url={`${api}/grades`}
            data={tablet}
            status={status}
          />
        </main>
      </div>
    </AccessGate>
  );
}

export const ErrorBoundary = TokenErrorBoundary;
