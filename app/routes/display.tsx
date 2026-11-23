import { useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import type { Route } from './+types/display';
import { AccessGate } from '~/components/AccessGate';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { ApparatusPanel } from '~/components/display/ApparatusPanel';
import { getColumns } from '~/components/display/displayState';
import { useDelayedRound, useIsExpired } from '~/components/display/useDisplayTimers';
import { ScreenControls } from '~/components/judging/ScreenControls';
import { Rings } from '~/components/Rings';
import { TokenErrorBoundary } from '~/components/TokenErrorBoundary';
import { useFontScale } from '~/hooks/useFontScale';
import { useIsOnline } from '~/hooks/useIsOnline';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { useWakeLock } from '~/hooks/useWakeLock';
import { resolveAccess } from '~/lib/access.server';
import { getDisplayState } from '~/lib/judging.server';
import { createLastData } from '~/lib/lastData';
import { cn } from '~/lib/utils';

export async function loader({ request, params: { linkId } }: Route.LoaderArgs) {
  const link = await resolveAccess(request, linkId, 'DISPLAY');
  if (!link) throw data(null, 403);
  const { apparatus, ...state } = await getDisplayState(link.competitionId, link.ground);
  return {
    competitionName: link.competition.name,
    ground: link.ground,
    ...state,
    apparatus: apparatus.map(({ apparatus: key, rounds }) => ({
      apparatus: key,
      rounds: rounds.map(({ slots }) =>
        slots.map(({ entryId, firstname, lastname, clubName, withdrawn, precision, grade }) => ({
          entryId,
          firstname,
          lastname,
          clubName,
          withdrawn,
          precision,
          grade: grade && { value: grade.value },
        })),
      ),
    })),
  };
}

const lastData = createLastData<Awaited<ReturnType<typeof loader>>>();

export function clientLoader({ params: { linkId }, serverLoader }: Route.ClientLoaderArgs) {
  return lastData.load(linkId, serverLoader);
}

export default function Display({ loaderData, params: { linkId } }: Route.ComponentProps) {
  const { competitionName, ground, round, divisionIds, hidesInMs, apparatus } = loaderData;
  useEffect(() => lastData.remember(linkId, loaderData), [linkId, loaderData]);

  const { t } = useTranslation(['display', 'common']);
  const stream = useLiveUpdates(`/api/display/${linkId}/events`);
  const status = useIsOnline() ? stream : 'lost';
  const { scale, change } = useFontScale('display-font-scale');
  const shownRound = useDelayedRound(round, divisionIds);
  const isExpired = useIsExpired(hidesInMs);
  useWakeLock();

  const isWaiting = apparatus.length === 0 || isExpired;
  const columns = getColumns(apparatus.length);

  return (
    <AccessGate>
      <div
        className="flex h-svh flex-col gap-2 overflow-hidden bg-ink p-2 text-ink-foreground"
        style={{ '--scale': scale } as CSSProperties}
      >
        <title>{`${t('screenTitle')} · UTEG`}</title>
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2">
          <h1 className="min-w-0 truncate font-display text-2xl">
            {competitionName}
            <span className="ml-4 text-ink-muted">{t('common:ground', { number: ground })}</span>
            {!isWaiting && (
              <span className="ml-4">{t('common:round', { number: shownRound + 1 })}</span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionBadge status={status} onInk />
            <ScreenControls scale={scale} onScale={change} />
          </div>
        </header>
        <main
          id="content"
          className={cn(
            'grid min-h-0 flex-1 auto-rows-fr gap-2',
            // The last of an odd number takes the whole row.
            columns === 2 && 'landscape:grid-cols-2 landscape:*:last:odd:col-span-2',
          )}
        >
          {isWaiting ? (
            <div className="flex min-h-0 flex-col items-center gap-4 text-center">
              <Rings className="min-h-0 w-full flex-1" />
              <p className="shrink-0 font-display text-[clamp(2.5rem,7vw,8rem)] leading-tight">
                {t('waitingTitle')}
              </p>
              <p className="shrink-0 pb-[6vh] text-[clamp(1.25rem,2.4vw,2.5rem)] text-ink-muted">
                {t('waitingText')}
              </p>
            </div>
          ) : (
            apparatus.map(({ apparatus: key, rounds }) => (
              <ApparatusPanel key={key} apparatus={key} slots={rounds[shownRound] ?? []} />
            ))
          )}
        </main>
      </div>
    </AccessGate>
  );
}

export const ErrorBoundary = TokenErrorBoundary;
