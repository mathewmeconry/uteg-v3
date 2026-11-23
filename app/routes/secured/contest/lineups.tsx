import { ArrowLeftIcon, InfoIcon, TriangleAlertIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/lineups';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { DivisionStateBadge } from '~/components/DivisionStateBadge';
import { LineupBoard } from '~/components/divisions/LineupBoard';
import type { LineupEntryData } from '~/components/divisions/LineupEntry';
import { UNASSIGNED } from '~/components/divisions/lineupMoves';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { useLineupMoves } from '~/components/divisions/useLineupMoves';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
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
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { DomainError } from '~/lib/errors';
import { getDivisionLineups, moveEntriesToLineup, unassignEntries } from '~/lib/lineups.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

type Apparatus = keyof (typeof import('~/locales/de/common'))['default']['apparatus'];

export async function loader({ context, params }: Route.LoaderArgs) {
  const { division, lineups, unassigned } = await loadDivision(context, params.divisionId);
  return {
    division,
    lineups: lineups.map(({ id, apparatus, entries }) => ({
      id,
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

const entry = z.array(z.string().min(1)).min(1);

const schema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('move'),
    entry,
    lineup: z.string().min(1),
    before: z.string().optional(),
  }),
  z.object({ intent: z.literal('unassign'), entry }),
]);

export async function action({ request, context, params }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const formData = await request.formData();
  const { data: values } = schema.safeParse({
    ...Object.fromEntries(formData),
    entry: [...new Set(formData.getAll('entry'))],
  });
  if (!values) {
    enqueueToast(context, { type: 'error', message: t('common:errors.invalid') });
    return data(null, 400);
  }

  const { division, lineups } = await loadDivision(context, params.divisionId);
  try {
    if (values.intent === 'unassign') {
      await unassignEntries(id, division.id, values.entry);
    } else {
      const lineup = lineups.find((item) => item.id === values.lineup);
      if (!lineup) throw data(null, 404);
      await moveEntriesToLineup(id, lineup.id, values.entry, values.before);
    }
    return data(null);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    enqueueToast(context, { type: 'error', message: domainErrorMessage(error, t) });
    return data(null, 400);
  }
}

/** Also after a refused move, so that it is no longer shown. */
export function shouldRevalidate() {
  return true;
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
  const { competition, canEdit } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const name = useDivisionName()(division);
  const [club, setClub] = useState(ALL_CLUBS);
  const { columns, move } = useLineupMoves(
    [
      { id: UNASSIGNED, entryIds: unassigned.map(({ id }) => id) },
      ...lineups.map((lineup) => ({ id: lineup.id, entryIds: lineup.entries.map(({ id }) => id) })),
    ],
    loaderData,
  );

  const entries = [...unassigned, ...lineups.flatMap((lineup) => lineup.entries)];
  const clubs = [...new Map(entries.map((item) => [item.clubId, item.clubName]))].sort(
    ([, a], [, b]) => a.localeCompare(b, 'de'),
  );
  // The last one of the club may have left the division.
  const clubId = clubs.some(([id]) => id === club) ? club : null;
  const starterCount = entries.filter(({ withdrawn }) => !withdrawn).length;

  function columnName(columnId: string) {
    const lineup = lineups.find(({ id }) => id === columnId);
    return lineup ? t(`common:apparatus.${lineup.apparatus}`) : t('lineups.unassigned');
  }

  return (
    <>
      <title>{`${t('lineupsTitle')} ${name} · UTEG`}</title>
      <Button asChild variant="link" className="mb-1 h-auto px-0 has-[>svg]:px-0">
        <Link to="../divisions" relative="route">
          <ArrowLeftIcon aria-hidden />
          {t('lineups.back')}
        </Link>
      </Button>
      <PageHeader
        title={t('lineupsTitle')}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{name}</span>
            <DivisionStateBadge state={division.state} />
            <span>{t('common:ground', { number: division.ground })}</span>
            <span>{t('common:starterCount', { count: starterCount })}</span>
          </span>
        }
        actions={<ConnectionBadge status={status} />}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={t('lineups.noStarters')}
          text={t('lineups.noStartersText')}
          action={
            <Button asChild variant="outline">
              <Link to={`/competitions/${competition.id}/starters`}>{t('lineups.toStarters')}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3">
            {division.state !== 'PENDING' && (
              <Alert role="note" className="border-warning bg-warning/10">
                <TriangleAlertIcon aria-hidden />
                <AlertTitle>
                  {t(division.state === 'RUNNING' ? 'lineups.running' : 'lineups.ended')}
                </AlertTitle>
                <AlertDescription className="text-foreground">
                  {t(division.state === 'RUNNING' ? 'lineups.runningText' : 'lineups.endedText')}
                </AlertDescription>
              </Alert>
            )}
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
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
            onMove={move}
          />
        </>
      )}
    </>
  );
}
