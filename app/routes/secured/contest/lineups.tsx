import { InfoIcon, TriangleAlertIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import type { Route } from './+types/lineups';
import { LineupBoard } from '~/components/divisions/LineupBoard';
import type { LineupEntryData } from '~/components/divisions/LineupEntry';
import { UNASSIGNED } from '~/components/divisions/lineupMoves';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { useLineupMoves } from '~/components/divisions/useLineupMoves';
import { EmptyState } from '~/components/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { competitionContext, contestContext, type Context } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { DomainError } from '~/lib/errors';
import { getDivisionLineups } from '~/lib/lineups.server';

type Apparatus = keyof (typeof import('~/locales/de/common'))['default']['apparatus'];

export async function loader({ context, params }: Route.LoaderArgs) {
  const { division, lineups, unassigned } = await loadDivision(context, params.divisionId);
  return {
    division,
    lineups: lineups.map(({ apparatus, entries }) => ({
      apparatus: apparatus as Apparatus,
      entries: entries.map(toEntryData),
    })),
    unassigned: unassigned
      .map(toEntryData)
      .sort(
        (a, b) =>
          a.lastname.localeCompare(b.lastname, 'de') ||
          a.firstname.localeCompare(b.firstname, 'de'),
      ),
  };
}

/** The division of the URL, if it belongs to the contest. */
async function loadDivision(context: Context, divisionId: string) {
  const { id } = context.get(competitionContext);
  const result = await getDivisionLineups(id, divisionId).catch((error: unknown) => {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') throw data(null, 404);
    throw error;
  });
  if (result.division.contestId !== context.get(contestContext).id) throw data(null, 404);
  return result;
}

type LoadedEntry = Awaited<ReturnType<typeof getDivisionLineups>>['unassigned'][number];

function toEntryData({ id, starter, withdrawnAt }: LoadedEntry): LineupEntryData {
  const { firstname, lastname, club } = starter;
  return {
    id,
    starterId: starter.id,
    firstname,
    lastname,
    clubId: club.id,
    clubName: club.name,
    withdrawn: withdrawnAt !== null,
  };
}

// Radix does not allow empty values.
const ALL_CLUBS = 'all';

export default function Lineups({ loaderData }: Route.ComponentProps) {
  const { division, lineups, unassigned } = loaderData;
  const { t } = useTranslation(['divisions', 'common']);
  const { competition, can } = useCompetition();
  const canEdit = can('edit');
  const name = useDivisionName()(division);
  const [club, setClub] = useState(ALL_CLUBS);
  const { columns, move } = useLineupMoves(
    `/api/competitions/${competition.id}/contests/${division.contestId}/divisions/${division.id}/lineup-moves`,
    [
      { id: UNASSIGNED, entryIds: unassigned.map(({ id }) => id) },
      ...lineups.map((lineup) => ({
        id: lineup.apparatus,
        entryIds: lineup.entries.map(({ id }) => id),
      })),
    ],
    loaderData,
  );

  const entries = [...unassigned, ...lineups.flatMap((lineup) => lineup.entries)];
  const clubs = [...new Map(entries.map((item) => [item.clubId, item.clubName]))].sort(
    ([, a], [, b]) => a.localeCompare(b, 'de'),
  );
  // The last one of the club may have left the division.
  const clubId = clubs.some(([id]) => id === club) ? club : null;

  function columnName(columnId: string) {
    const lineup = lineups.find(({ apparatus }) => apparatus === columnId);
    return lineup ? t(`common:apparatus.${lineup.apparatus}`) : t('lineups.unassigned');
  }

  return (
    <>
      <title>{`${t('lineupsTitle')} ${name} · UTEG`}</title>
      {entries.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={t('lineups.noStarters')}
          text={t('lineups.noStartersText')}
          action={
            <Button asChild>
              <Link to={`/competitions/${competition.id}/starters`}>{t('lineups.toStarters')}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3">
            {division.state !== 'PENDING' && (
              <Alert role="note" variant="warning">
                <TriangleAlertIcon aria-hidden />
                <AlertTitle>
                  {t(division.state === 'RUNNING' ? 'lineups.running' : 'lineups.ended')}
                </AlertTitle>
                <AlertDescription>
                  {t(division.state === 'RUNNING' ? 'lineups.runningText' : 'lineups.endedText')}
                </AlertDescription>
              </Alert>
            )}
            <p className="flex max-w-prose items-start gap-2 text-sm text-muted-foreground">
              <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('lineups.order')}
            </p>
            <Select value={clubId ?? ALL_CLUBS} onValueChange={setClub}>
              <SelectTrigger aria-label={t('lineups.club')} className="w-full bg-card sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL_CLUBS}>{t('lineups.allClubs')}</SelectItem>
                {clubs.map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LineupBoard
            entries={entries}
            columns={columns}
            columnName={columnName}
            clubId={clubId}
            canEdit={canEdit}
            editUrl={(starterId) => `/competitions/${competition.id}/starters?edit=${starterId}`}
            onMove={move}
          />
        </>
      )}
    </>
  );
}
